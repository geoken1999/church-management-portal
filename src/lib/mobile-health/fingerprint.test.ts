import { describe, expect, it } from "vitest";
import { errorFingerprint, parseTelemetry } from "./fingerprint";

const DEVICE = "0f8c1a52-3b6e-4d7a-9a41-2c7f5e8d1b90";

describe("errorFingerprint", () => {
  it("groups the same error whatever the numbers and ids in it", () => {
    const a = errorFingerprint(
      "Bad state: member 123 not found (aa1ea6aa-78b9-40e9-b256-1613da830290)",
      "members",
    );
    const b = errorFingerprint(
      "Bad state: member 987 not found (2024e283-de3b-4090-a9b4-3941408a2584)",
      "members",
    );
    expect(a).toBe(b);
  });

  it("keeps different screens apart", () => {
    expect(errorFingerprint("Boom", "call")).not.toBe(
      errorFingerprint("Boom", "login"),
    );
  });
});

describe("parseTelemetry", () => {
  const good = {
    deviceId: DEVICE,
    platform: "android",
    kind: "error",
    message: "x",
    appVersion: "1.0.0",
  };

  it("accepts a normal report", () => {
    expect(parseTelemetry(good)?.kind).toBe("error");
  });

  it("rejects a bad device id, platform or kind", () => {
    expect(parseTelemetry({ ...good, deviceId: "nope" })).toBeNull();
    expect(parseTelemetry({ ...good, platform: "windows" })).toBeNull();
    expect(parseTelemetry({ ...good, kind: "delete everything" })).toBeNull();
    expect(parseTelemetry(null)).toBeNull();
  });

  it("caps the size of text fields", () => {
    const parsed = parseTelemetry({
      ...good,
      message: "m".repeat(5000),
      stack: "s".repeat(50000),
    });
    expect(parsed?.message.length).toBe(600);
    expect(parsed?.stack.length).toBe(12000);
  });
});
