import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s): what every authenticator app uses.
const STEP_SECONDS = 30;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

export const currentStep = (now = Date.now()) =>
  Math.floor(now / 1000 / STEP_SECONDS);

/**
 * Returns the matching time step (±1 step of clock drift) or null.
 * Callers must reject steps <= the last used one, so a code works once.
 */
export function verifyTotp(
  secret: string,
  code: string,
  now = Date.now(),
): number | null {
  if (!/^[0-9]{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (const candidate of [step - 1, step, step + 1]) {
    const expected = Buffer.from(totpCode(secret, candidate));
    if (timingSafeEqual(expected, Buffer.from(code))) return candidate;
  }
  return null;
}

export const otpauthUrl = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`KUSH:${account}`)}?secret=${secret}&issuer=KUSH&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

// ------------------------------------------------- secret encryption at rest

function key(): Buffer {
  const raw = process.env.KUSH_MFA_KEY;
  if (!raw || raw.length < 32)
    throw new Error("KUSH_MFA_KEY must be set (at least 32 characters)");
  return createHash("sha256").update(raw).digest();
}

export function sealSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((part) => (typeof part === "string" ? part : part.toString("base64")))
    .join(".");
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data)
    throw new Error("Unknown secret format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// --------------------------------------------------------- recovery codes

/** Ten single-use codes, e.g. `7KQ2-M9XD-4TRP`. Only hashes are stored. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () =>
    base32Encode(randomBytes(8))
      .slice(0, 12)
      .replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3"),
  );
}

export const recoveryCodeHash = (code: string) =>
  createHash("sha256")
    .update(`kush-recovery:${code.toUpperCase().replace(/[^A-Z2-7]/g, "")}`)
    .digest("hex");
