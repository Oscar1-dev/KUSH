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
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "x-kush-website-secret": websiteSecret(),
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
  };
  if (!response.ok)
    throw new ApiError(response.status, data.error ?? "Something went wrong");
  return data as T;
}
