import { createHash } from "node:crypto";

/** Non-2xx API response; `message` comes from the API and is safe to show. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DiscordApiClientOptions {
  baseUrl: string;
  tenantId: string;
  guildId: string;
  integrationSecret: string;
  fetch?: typeof fetch;
}

export function requestUuid(interactionId: string): string {
  const bytes = createHash("sha256")
    .update(`kush-discord:${interactionId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class DiscordApiClient {
  readonly #fetch: typeof fetch;

  constructor(private readonly options: DiscordApiClientOptions) {
    this.#fetch = options.fetch ?? fetch;
  }

  async #post<T>(
    path: string,
    body: unknown,
    actor?: { discordUserId: string; guildId: string },
  ): Promise<T> {
    const response = await this.#fetch(new URL(path, this.options.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-kush-discord-secret": this.options.integrationSecret,
        ...(actor
          ? {
              "x-kush-discord-user-id": actor.discordUserId,
              "x-kush-discord-guild-id": actor.guildId,
            }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      throw new ApiError(
        response.status,
        typeof error?.error === "string"
          ? error.error
          : `KUSH API request failed (${response.status})`,
      );
    }
    return (await response.json()) as T;
  }

  async complete(input: {
    code: string;
    discordUserId: string;
    guildId: string;
  }): Promise<void> {
    await this.#post(
      `/discord/integration/tenants/${this.options.tenantId}/links/complete`,
      input,
    );
  }

  async create(input: {
    discordUserId: string;
    guildId: string;
    interactionId: string;
    category: string;
    description: string;
  }): Promise<{ reference: string }> {
    const result = await this.#post<{ ticket: { number: number } }>(
      `/discord/integration/tenants/${this.options.tenantId}/tickets`,
      {
        requestId: requestUuid(input.interactionId),
        category: input.category,
        description: input.description,
      },
      input,
    );
    return { reference: `#${result.ticket.number}` };
  }

  /** Partner programme application, stored as a commercial request of kind "partner". */
  async submitApplication(input: {
    discordUserId: string;
    guildId: string;
    interactionId: string;
    programme: "seller" | "reseller";
    title: string;
    details: string;
    url: string | null;
  }): Promise<{ id: string; status: string }> {
    const result = await this.#post<{
      request: { id: string; status: string };
    }>(
      `/discord/integration/tenants/${this.options.tenantId}/commercial-requests`,
      {
        requestId: requestUuid(input.interactionId),
        kind: "partner",
        category: `${input.programme}-application`,
        title: input.title,
        details: input.details,
        productUrl: input.url,
      },
      input,
    );
    return result.request;
  }

  /** Unauthenticated liveness probe of the KUSH API. */
  async health(): Promise<boolean> {
    const response = await this.#fetch(
      new URL("/health", this.options.baseUrl),
      { signal: AbortSignal.timeout(5_000) },
    );
    return response.ok;
  }
}
