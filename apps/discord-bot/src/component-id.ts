import { createHmac, timingSafeEqual } from "node:crypto";

export interface ComponentPayload {
  action: string;
  subject: string;
  expiresAt: number;
}

/** Discord rejects component custom IDs longer than 100 characters. */
export const MAX_CUSTOM_ID_LENGTH = 100;

const VERSION = "k2";
const SEPARATOR = "|";
const sign = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body).digest("base64url").slice(0, 16);

/**
 * Compact signed ID: `k2|action|subject|expiry(base36)|hmac`. The HMAC binds
 * the action, the user it was issued to and its expiry.
 */
export function createComponentId(
  payload: ComponentPayload,
  secret: string,
): string {
  if (
    [payload.action, payload.subject].some((part) => part.includes(SEPARATOR))
  )
    throw new Error("Component ID fields must not contain '|'");
  const body = [
    VERSION,
    payload.action,
    payload.subject,
    payload.expiresAt.toString(36),
  ].join(SEPARATOR);
  const id = `${body}${SEPARATOR}${sign(body, secret)}`;
  if (id.length > MAX_CUSTOM_ID_LENGTH)
    throw new Error(`Component ID exceeds ${MAX_CUSTOM_ID_LENGTH} characters`);
  return id;
}

export function verifyComponentId(
  value: string,
  secret: string,
  now = Date.now(),
): ComponentPayload | null {
  const parts = value.split(SEPARATOR);
  if (parts.length !== 5 || parts[0] !== VERSION) return null;
  const [, action, subject, expiry, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = sign(parts.slice(0, 4).join(SEPARATOR), secret);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return null;
  const expiresAt = Number.parseInt(expiry, 36);
  if (!action || !subject || !Number.isFinite(expiresAt) || expiresAt < now)
    return null;
  return { action, subject, expiresAt };
}
