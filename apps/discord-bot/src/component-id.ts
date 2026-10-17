import { createHmac, timingSafeEqual } from "node:crypto";

export interface ComponentPayload {
  action: string;
  subject: string;
  expiresAt: number;
}

const encode = (value: string) => Buffer.from(value).toString("base64url");
const sign = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body).digest("base64url").slice(0, 16);

export function createComponentId(
  payload: ComponentPayload,
  secret: string,
): string {
  const body = encode(JSON.stringify(payload));
  return `k1.${body}.${sign(body, secret)}`;
}

export function verifyComponentId(
  value: string,
  secret: string,
  now = Date.now(),
): ComponentPayload | null {
  const [version, body, signature, extra] = value.split(".");
  if (version !== "k1" || !body || !signature || extra) return null;
  const expected = sign(body, secret);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<ComponentPayload>;
    if (
      typeof parsed.action !== "string" ||
      typeof parsed.subject !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < now
    )
      return null;
    return parsed as ComponentPayload;
  } catch {
    return null;
  }
}
