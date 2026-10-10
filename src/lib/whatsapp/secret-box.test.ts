import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { encryptSecret, decryptSecret } from "./secret-box";

beforeAll(() => {
  process.env.WHATSAPP_CREDENTIALS_KEY = crypto.randomBytes(32).toString("base64");
});

describe("secret box", () => {
  it("round-trips a value", () => {
    expect(decryptSecret(encryptSecret("EAAG-token-123"))).toBe("EAAG-token-123");
  });

  it("uses a fresh IV, so the same value encrypts differently each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("does not contain the plaintext", () => {
    expect(encryptSecret("EAAG-token-123")).not.toContain("EAAG");
  });

  it("rejects a tampered value", () => {
    const parts = encryptSecret("secret").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
