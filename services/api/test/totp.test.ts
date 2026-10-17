import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  currentStep,
  newRecoveryCodes,
  openSecret,
  recoveryCodeHash,
  sealSecret,
  totpCode,
  verifyTotp,
} from "../src/totp.js";

// RFC 6238 appendix B (SHA-1), truncated to 6 digits.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    for (const [seconds, code] of [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
    ] as const)
      expect(totpCode(RFC_SECRET, Math.floor(seconds / 30))).toBe(code);
  });

  it("round-trips base32", () => {
    const bytes = Buffer.from("any bytes ÿ", "utf8");
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("accepts one step of clock drift only", () => {
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now)).toBe(
      step - 1,
    );
    expect(
      verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), now),
    ).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
  });

  it("encrypts secrets at rest", () => {
    process.env.KUSH_MFA_KEY ??= "unit-test-mfa-key-at-least-32-characters";
    const sealed = sealSecret(RFC_SECRET);
    expect(sealed).not.toContain(RFC_SECRET);
    expect(openSecret(sealed)).toBe(RFC_SECRET);
    const tampered =
      sealed.slice(0, -2) +
      (sealed.endsWith("A") ? "B" : "A") +
      sealed.slice(-1);
    expect(() => openSecret(tampered)).toThrow();
  });

  it("makes ten distinct recovery codes, normalised for hashing", () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(recoveryCodeHash(codes[0]!.toLowerCase().replace(/-/g, " "))).toBe(
      recoveryCodeHash(codes[0]!),
    );
  });
});
