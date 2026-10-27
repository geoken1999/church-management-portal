import { describe, expect, it } from "vitest";
import { decryptBytes, encryptBytes, isEncryptedPath, parseProofKey } from "./proof-crypto";

const key = Buffer.alloc(32, 7);

describe("proof document encryption", () => {
  it("round-trips and hides the content", () => {
    const plain = Buffer.from("registration certificate %PDF-1.7");
    const sealed = encryptBytes(plain, key);
    expect(sealed.includes(plain)).toBe(false);
    expect(decryptBytes(sealed, key).equals(plain)).toBe(true);
  });
  it("uses a new IV each time", () => {
    const plain = Buffer.from("same");
    expect(encryptBytes(plain, key).equals(encryptBytes(plain, key))).toBe(false);
  });
  it("refuses a wrong key or a changed file", () => {
    const sealed = encryptBytes(Buffer.from("secret"), key);
    expect(() => decryptBytes(sealed, Buffer.alloc(32, 8))).toThrow();
    sealed[sealed.length - 1] ^= 1;
    expect(() => decryptBytes(sealed, key)).toThrow();
  });
  it("only accepts a 32-byte base64 key", () => {
    expect(parseProofKey(key.toString("base64"))).not.toBeNull();
    expect(parseProofKey("short")).toBeNull();
    expect(parseProofKey(undefined)).toBeNull();
  });
  it("recognises encrypted paths", () => {
    expect(isEncryptedPath("org/a.pdf.enc")).toBe(true);
    expect(isEncryptedPath("org/a.pdf")).toBe(false);
  });
});
