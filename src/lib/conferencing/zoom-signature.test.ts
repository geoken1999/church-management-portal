import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { cleanMeetingNumber, zoomSignature } from "./zoom-signature";

describe("zoomSignature", () => {
  it("is a verifiable HS256 token with the meeting and role in it", () => {
    const token = zoomSignature({ sdkKey: "key", sdkSecret: "secret", meetingNumber: "81234567890", role: 1, now: 1_700_000_000_000 });
    const [h, p, s] = token.split(".");
    expect(crypto.createHmac("sha256", "secret").update(`${h}.${p}`).digest("base64url")).toBe(s);
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(payload).toMatchObject({ appKey: "key", sdkKey: "key", mn: "81234567890", role: 1 });
    expect(payload.exp - payload.iat).toBe(7200);
    expect(payload.iat).toBe(1_700_000_000 - 30);
  });
});

describe("cleanMeetingNumber", () => {
  it("accepts 9 to 11 digits, with spaces", () => {
    expect(cleanMeetingNumber("812 3456 7890")).toBe("81234567890");
    expect(cleanMeetingNumber("12345")).toBeNull();
    expect(cleanMeetingNumber("abc123456789")).toBeNull();
  });
});
