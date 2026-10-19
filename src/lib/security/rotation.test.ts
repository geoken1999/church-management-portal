import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { openSecret, sealSecret } from "./connection-secrets";
import {
  open,
  parseKey,
  rekey,
  seal,
  TARGETS,
} from "../../../scripts/connection-secrets-lib.mjs";

const OLD = Buffer.alloc(32, 1).toString("base64");
const NEW = Buffer.alloc(32, 2).toString("base64");

describe("key rotation helpers", () => {
  const original = process.env.CONNECTION_SECRETS_KEY;
  beforeEach(() => {
    process.env.CONNECTION_SECRETS_KEY = OLD;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CONNECTION_SECRETS_KEY;
    else process.env.CONNECTION_SECRETS_KEY = original;
  });

  it("the scripts and the app seal and open the same format", () => {
    const fromScript = seal("token-from-script", parseKey(OLD));
    expect(openSecret(fromScript)).toBe("token-from-script");
    const fromApp = sealSecret("token-from-app");
    expect(open(fromApp, parseKey(OLD))).toBe("token-from-app");
  });

  it("moves a value from the old key to the new one", () => {
    const sealedOld = sealSecret("secret-1");
    const result = rekey(sealedOld, parseKey(OLD), parseKey(NEW));
    expect(result.action).toBe("rotate");
    process.env.CONNECTION_SECRETS_KEY = NEW;
    expect(openSecret(result.value as string)).toBe("secret-1");
  });

  it("is safe to run twice: a value already on the new key is kept", () => {
    const onNew = seal("secret-2", parseKey(NEW));
    expect(rekey(onNew, parseKey(OLD), parseKey(NEW)).action).toBe("keep");
  });

  it("seals plain text with the new key", () => {
    const result = rekey("plain-token", parseKey(OLD), parseKey(NEW));
    expect(result.action).toBe("seal");
    expect(open(result.value, parseKey(NEW))).toBe("plain-token");
  });

  it("reports, never overwrites, a value that opens with neither key", () => {
    const stranger = seal(
      "x",
      parseKey(Buffer.alloc(32, 9).toString("base64")),
    );
    expect(rekey(stranger, parseKey(OLD), parseKey(NEW)).action).toBe(
      "unreadable",
    );
  });

  it("rejects a key of the wrong size", () => {
    expect(() => parseKey(Buffer.alloc(16).toString("base64"))).toThrow(
      /32 bytes/,
    );
    expect(() => parseKey(undefined as unknown as string, "KEY")).toThrow(
      /KEY is not set/,
    );
  });

  it("covers every table that holds a connection secret", () => {
    expect(TARGETS.map((t: { table: string }) => t.table).sort()).toEqual(
      [
        "email_smtp_settings",
        "facebook_connections",
        "instagram_connections",
        "organization_gateway_accounts",
        "organization_razorpay_accounts",
        "youtube_connections",
      ].sort(),
    );
  });
});
