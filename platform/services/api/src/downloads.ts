import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "@kush/database";
import type { WebHelpers } from "./accounts.js";
import { SupportError } from "./support-service.js";

/**
 * Protected downloads.
 * - Customers only see files for products they hold an ACTIVE entitlement
 *   to (not expired, not revoked/refunded).
 * - Downloading needs a signed link: HMAC over (file, user, expiry), valid
 *   for 5 minutes. The entitlement is checked again when the link is used,
 *   so revoking access stops downloads immediately.
 * - Files are stored outside any web root and streamed by the API.
 */

export const LINK_SECONDS = 300;
const tenantOf = () =>
  process.env.KUSH_SUPPORT_TENANT_ID ??
  (() => {
    throw new SupportError(503, "Downloads are not configured");
  })();
const signingKey = () => {
  const key = process.env.KUSH_DOWNLOAD_KEY ?? process.env.KUSH_MFA_KEY;
  if (!key || key.length < 32)
    throw new SupportError(503, "Downloads are not configured");
  return `kush-download:${key}`;
};
const directory = () =>
  process.env.KUSH_DOWNLOADS_DIR ?? path.resolve(".local", "downloads");

/**
 * Compact binary token (fits in a URL segment): file id (16 bytes), user id
 * (16), expiry seconds (4), then a 128-bit HMAC over those 36 bytes.
 */
const uuidBytes = (id: string) => Buffer.from(id.replace(/-/g, ""), "hex");
const uuidText = (bytes: Buffer) =>
  bytes
    .toString("hex")
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
const mac = (body: Buffer) =>
  createHmac("sha256", signingKey()).update(body).digest().subarray(0, 16);

export function signDownload(
  fileId: string,
  userId: string,
  expiresAt: number,
) {
  const body = Buffer.alloc(36);
  uuidBytes(fileId).copy(body, 0);
  uuidBytes(userId).copy(body, 16);
  body.writeUInt32BE(expiresAt, 32);
  return Buffer.concat([body, mac(body)]).toString("base64url");
}

export function verifyDownload(token: string, now = Date.now()) {
  const raw = Buffer.from(token, "base64url");
  if (raw.length !== 52) return null;
  const body = raw.subarray(0, 36);
  if (!timingSafeEqual(raw.subarray(36), mac(body))) return null;
  if (body.readUInt32BE(32) * 1000 < now) return null;
  return {
    fileId: uuidText(body.subarray(0, 16)),
    userId: uuidText(body.subarray(16, 32)),
  };
}

export async function registerDownloads(
  app: FastifyInstance,
  { pool, web }: { pool: Pool; web: WebHelpers },
) {
  const { signedIn, website, handle } = web;

  /** Files this user may download right now. */
  const allowed = (userId: string, fileId?: string) =>
    pool.query<{
      id: string;
      filename: string;
      version: string;
      size_bytes: string;
      sha256: string;
      storage_key: string;
      product_name: string;
      created_at: Date;
    }>(
      `SELECT f.id,f.filename,f.version,f.size_bytes,f.sha256,f.storage_key,p.name AS product_name,f.created_at
       FROM product_files f JOIN products p ON p.tenant_id=f.tenant_id AND p.id=f.product_id
       WHERE f.tenant_id=$1 AND f.active AND p.status='active'
         ${fileId ? "AND f.id=$3" : ""}
         AND EXISTS (SELECT 1 FROM entitlements e WHERE e.tenant_id=f.tenant_id AND e.product_id=f.product_id
                     AND e.user_id=$2 AND e.status='active' AND (e.expires_at IS NULL OR e.expires_at > now()))
       ORDER BY p.name, f.created_at DESC`,
      fileId ? [tenantOf(), userId, fileId] : [tenantOf(), userId],
    );
  const record = (userId: string, fileId: string, kind: string) =>
    pool
      .query(
        "INSERT INTO download_events(tenant_id,user_id,file_id,kind) VALUES($1,$2,$3,$4)",
        [tenantOf(), userId, fileId, kind],
      )
      .catch(() => undefined);
  const uuid = { type: "string", format: "uuid" };

  app.get(
    "/web/account/downloads",
    signedIn(async (session) => ({
      files: (await allowed(session.userId)).rows.map((f) => ({
        id: f.id,
        product: f.product_name,
        filename: f.filename,
        version: f.version,
        sizeBytes: Number(f.size_bytes),
        sha256: f.sha256,
        createdAt: f.created_at,
      })),
    })),
  );

  app.post(
    "/web/account/downloads/:fileId/link",
    {
      schema: {
        params: {
          type: "object",
          properties: { fileId: uuid },
          required: ["fileId"],
          additionalProperties: false,
        },
      },
    },
    signedIn(async (session, request) => {
      const { fileId } = request.params as { fileId: string };
      const file = (await allowed(session.userId, fileId)).rows[0];
      if (!file) throw new SupportError(404, "Download not found");
      const expiresAt = Math.floor(Date.now() / 1000) + LINK_SECONDS;
      await record(session.userId, fileId, "link_issued");
      return {
        token: signDownload(fileId, session.userId, expiresAt),
        expiresAt,
      };
    }),
  );

  // Redeemed by the website server for the visitor; no session needed (the
  // signed token is the authorisation), but entitlement is re-checked.
  app.get(
    "/web/downloads/:token",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            token: { type: "string", pattern: "^[A-Za-z0-9_-]{20,400}$" },
          },
          required: ["token"],
          additionalProperties: false,
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const result = await handle(reply, async () => {
        website(request);
        const claim = verifyDownload(
          (request.params as { token: string }).token,
        );
        if (!claim)
          throw new SupportError(
            403,
            "This download link is invalid or has expired",
          );
        const file = (await allowed(claim.userId, claim.fileId)).rows[0];
        if (!file) {
          await record(claim.userId, claim.fileId, "denied");
          throw new SupportError(
            403,
            "You no longer have access to this download",
          );
        }
        const location = path.join(directory(), file.storage_key);
        const info = await stat(location).catch(() => null);
        if (!info?.isFile()) throw new SupportError(404, "File is unavailable");
        await record(claim.userId, claim.fileId, "downloaded");
        return { file, location, size: info.size };
      });
      if (!result || typeof result !== "object" || !("location" in result))
        return result;
      const { file, location, size } = result as {
        file: { filename: string; sha256: string };
        location: string;
        size: number;
      };
      return reply
        .header("Content-Type", "application/octet-stream")
        .header("Content-Length", String(size))
        .header(
          "Content-Disposition",
          `attachment; filename="${file.filename}"`,
        )
        .header("X-Content-SHA256", file.sha256)
        .header("Cache-Control", "no-store")
        .send(createReadStream(location));
    },
  );
}
