import "server-only";

/**
 * Server-to-server client for the KUSH API. The API is the authority for
 * identity, sessions, MFA and permissions; this website never decides those
 * itself. Browsers never see the website secret or call the API directly.
 */

const apiUrl = () => process.env.KUSH_API_URL ?? "http://127.0.0.1:4310";

function websiteSecret() {
  const secret = process.env.KUSH_WEBSITE_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("KUSH_WEBSITE_SECRET is not configured");
  return secret;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Why staff access was refused (e.g. "mfa_required"), when given. */
    readonly reason?: string,
  ) {
    super(message);
  }
}

export async function kushApi<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    token?: string | undefined;
    body?: unknown;
    /** Extra server-to-server headers (e.g. signer audit details). */
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "x-kush-website-secret": websiteSecret(),
        ...(options.headers ?? {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(503, "KUSH services are unavailable. Please try again shortly.");
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    reason?: string;
  };
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error ?? "Something went wrong",
      data.reason,
    );
  return data as T;
}

/** Downloads a binary response (PDFs) from the API, server-side. */
export async function kushApiBinary(path: string, token: string) {
  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, {
      headers: { "x-kush-website-secret": websiteSecret(), authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ApiError(503, "KUSH services are unavailable. Please try again shortly.");
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; reason?: string };
    throw new ApiError(response.status, data.error ?? "Something went wrong", data.reason);
  }
  return { body: await response.arrayBuffer(), disposition: response.headers.get("content-disposition") };
}
