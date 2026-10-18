export const API_URL = "http://127.0.0.1:4310";
export type User = { id: string; email: string; role: string };
export const ENDPOINTS = [API_URL, "http://localhost:4310"] as const;
export function validatedEndpoint(value: unknown): string {
  return ENDPOINTS.includes(value as (typeof ENDPOINTS)[number])
    ? String(value)
    : API_URL;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  endpoint = API_URL,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${validatedEndpoint(endpoint)}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok)
      throw new ApiError(
        response.status,
        response.status === 401
          ? "Your session has expired or the credentials are incorrect."
          : response.status === 409
            ? "This record changed or its workflow prerequisites are incomplete. Refresh and check the saved record."
            : response.status === 403
              ? "Your account does not have permission for this action."
              : response.status === 400
                ? "Check the fields and workflow requirements, then try again."
                : `API request failed (${response.status}).`,
      );
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw new Error(
        "Local API unavailable. Start the API and check its logs.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export function pollingInterval(value: unknown): number {
  const parsed =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && [5, 10, 30, 60].includes(parsed)
    ? parsed
    : 10;
}
export function loadPolling(): number {
  try {
    return pollingInterval(localStorage.getItem("kush.pollSeconds"));
  } catch {
    return 10;
  }
}
