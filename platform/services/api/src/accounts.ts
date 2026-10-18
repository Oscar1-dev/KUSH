import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import { z } from "@kush/contracts";
import {
  AccountService,
  discordOAuth,
  oauthSettingsFromEnv,
  passedMfa,
  type DiscordOAuth,
  type WebSession,
} from "./account-service.js";
import { verifyIntegrationSecret } from "./discord-service.js";
import { SupportError } from "./support-service.js";

interface Options {
  pool: Pool;
  /** Tests inject a fake Discord; production reads KUSH_DISCORD_* env vars. */
  oauth?: () => DiscordOAuth | null;
}

/**
 * Website account API (`/web/...`). Only the KUSH website's own server may
 * call it (shared secret); browsers never talk to the API directly. The
 * session token travels server-to-server as a Bearer token.
 */
export async function registerAccounts(
  app: FastifyInstance,
  { pool, oauth }: Options,
) {
  const service = new AccountService(
    pool,
    oauth ??
      (() => {
        const settings = oauthSettingsFromEnv();
        return settings ? discordOAuth(settings) : null;
      }),
  );

  const website = (request: FastifyRequest) => {
    const value = request.headers["x-kush-website-secret"];
    verifyIntegrationSecret(
      typeof value === "string" ? value : undefined,
      process.env.KUSH_WEBSITE_SECRET,
    );
  };
  const bearer = (request: FastifyRequest) =>
    request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];

  const handle = async (reply: FastifyReply, work: () => Promise<unknown>) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await work();
    } catch (error) {
      if (error instanceof SupportError)
        return reply.code(error.status).send({
          error: error.message,
          // Staff denials explain which step is missing (e.g. 2FA).
          ...("reason" in error ? { reason: error.reason } : {}),
        });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: "Invalid request" });
      throw error;
    }
  };
  /**
   * Website secret + a live website session. Unless `beforeMfa` is set, a
   * session on a 2FA account must have passed 2FA (enforced here, not only
   * by the website).
   */
  const signedIn =
    (
      work: (session: WebSession, request: FastifyRequest) => Promise<unknown>,
      options: { beforeMfa?: boolean } = {},
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) =>
      handle(reply, async () => {
        website(request);
        const session = await service.session(bearer(request));
        if (!session) return reply.code(401).send({ error: "Please sign in" });
        if (!options.beforeMfa && !passedMfa(session))
          return reply
            .code(403)
            .send({ error: "Two-factor verification required", mfa: true });
        return work(session, request);
      });
  const body = (schema: z.ZodType) =>
    z.toJSONSchema(schema, { target: "draft-7", io: "input" });

  const binding = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
  const code = z.string().regex(/^[0-9]{6}$/);
  const startSchema = z.object({ binding }).strict();
  const callbackSchema = z
    .object({
      state: z.string().min(16).max(128),
      code: z.string().min(1).max(256),
      binding,
      userAgent: z.string().max(400),
    })
    .strict();
  const profileSchema = z
    .object({ displayName: z.string().trim().min(1).max(40).nullable() })
    .strict();
  const codeSchema = z.object({ code }).strict();
  const verifySchema = z
    .object({
      code: code.optional(),
      recoveryCode: z
        .string()
        .regex(/^[A-Za-z2-7-]{12,16}$/)
        .optional(),
    })
    .strict()
    .refine((value) => Boolean(value.code) !== Boolean(value.recoveryCode));
  const logoutSchema = z
    .object({ scope: z.enum(["this", "others", "all"]) })
    .strict();

  app.post(
    "/web/auth/discord/start",
    { schema: { body: body(startSchema) } },
    async (request, reply) =>
      handle(reply, async () => {
        website(request);
        return service.startDiscord(startSchema.parse(request.body).binding);
      }),
  );

  app.post(
    "/web/auth/discord/callback",
    // No per-IP limit here: every call comes from the website server's one
    // IP. The website limits per visitor; states are single-use.
    { schema: { body: body(callbackSchema) } },
    async (request, reply) =>
      handle(reply, async () => {
        website(request);
        return service.completeDiscord(callbackSchema.parse(request.body));
      }),
  );

  app.get(
    "/web/account",
    // Readable before 2FA: the verify page needs to know 2FA is pending.
    signedIn((session) => service.profile(session), { beforeMfa: true }),
  );

  app.patch(
    "/web/account",
    { schema: { body: body(profileSchema) } },
    signedIn(async (session, request) => {
      await service.updateProfile(
        session,
        profileSchema.parse(request.body).displayName,
      );
      return service.profile(session);
    }),
  );

  app.get(
    "/web/account/sessions",
    signedIn(async (session) => ({
      sessions: await service.listSessions(session),
    })),
  );

  app.post<{ Params: { sessionId: string } }>(
    "/web/account/sessions/:sessionId/revoke",
    {
      schema: {
        params: {
          type: "object",
          properties: { sessionId: { type: "string", format: "uuid" } },
          required: ["sessionId"],
          additionalProperties: false,
        },
      },
    },
    signedIn(async (session, request) => {
      const { sessionId } = request.params as { sessionId: string };
      await service.revokeSession(session, sessionId);
      return { revoked: true };
    }),
  );

  app.post(
    "/web/account/logout",
    { schema: { body: body(logoutSchema) } },
    signedIn(
      async (session, request) => ({
        revoked: await service.logout(
          session,
          logoutSchema.parse(request.body).scope,
        ),
      }),
      { beforeMfa: true },
    ),
  );

  app.post(
    "/web/account/mfa/totp/setup",
    signedIn((session) => service.beginTotp(session)),
  );

  app.post(
    "/web/account/mfa/totp/enable",
    { schema: { body: body(codeSchema) } },
    signedIn((session, request) =>
      service.enableTotp(session, codeSchema.parse(request.body).code),
    ),
  );

  app.post(
    "/web/account/mfa/verify",
    { schema: { body: body(verifySchema) } },
    signedIn(
      (session, request) => {
        const input = verifySchema.parse(request.body);
        return service.verify(session, {
          ...(input.code ? { code: input.code } : {}),
          ...(input.recoveryCode ? { recoveryCode: input.recoveryCode } : {}),
        });
      },
      { beforeMfa: true },
    ),
  );

  app.post(
    "/web/account/mfa/totp/disable",
    { schema: { body: body(codeSchema) } },
    signedIn((session, request) =>
      service.disableTotp(session, codeSchema.parse(request.body).code),
    ),
  );

  app.post(
    "/web/account/mfa/recovery-codes",
    { schema: { body: body(codeSchema) } },
    signedIn((session, request) =>
      service.regenerateRecoveryCodes(
        session,
        codeSchema.parse(request.body).code,
      ),
    ),
  );

  return { service, signedIn, handle, body, website };
}

export type WebHelpers = Awaited<ReturnType<typeof registerAccounts>>;
