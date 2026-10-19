import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isSealed,
  openOptionalSecret,
  openSecret,
  sealSecret,
} from "./connection-secrets";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("connection secrets", () => {
  const original = process.env.CONNECTION_SECRETS_KEY;
  beforeEach(() => {
    process.env.CONNECTION_SECRETS_KEY = KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CONNECTION_SECRETS_KEY;
    else process.env.CONNECTION_SECRETS_KEY = original;
  });

  it("round-trips a secret and never stores it readable", () => {
    const sealed = sealSecret("EAAB-token-123");
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("EAAB-token-123");
    expect(openSecret(sealed)).toBe("EAAB-token-123");
  });
  it("uses a fresh IV each time", () => {
    expect(sealSecret("same")).not.toBe(sealSecret("same"));
  });
  it("does not seal twice", () => {
    const once = sealSecret("x");
    expect(sealSecret(once)).toBe(once);
  });
  it("passes an older plain-text value through unchanged", () => {
    expect(openSecret("plain-old-token")).toBe("plain-old-token");
    expect(openOptionalSecret(null)).toBeNull();
  });
  it("detects tampering and refuses to seal without a key", () => {
    const sealed = sealSecret("secret");
    expect(() => openSecret(sealed.slice(0, -2) + "AA")).toThrow();
    delete process.env.CONNECTION_SECRETS_KEY;
    expect(() => sealSecret("secret")).toThrow(/CONNECTION_SECRETS_KEY/);
  });
});
