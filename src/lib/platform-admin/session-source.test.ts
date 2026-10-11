import { describe, it, expect } from "vitest";
import { sessionPerson, sessionSource } from "./session-source";

describe("sessionSource", () => {
  it("recognises the mobile app and the web dashboard from the sign-in's user agent", () => {
    expect(sessionSource("Dart/3.11 (dart:io)")).toBe("mobile");
    expect(sessionSource("node")).toBe("web");
    expect(sessionSource("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")).toBe("web");
  });

  it("falls back to other for anything unknown or missing", () => {
    expect(sessionSource(null)).toBe("other");
    expect(sessionSource("")).toBe("other");
    expect(sessionSource("curl/8.0")).toBe("other");
  });
});

describe("sessionPerson", () => {
  it("an email means a team login, no email a phone-login member", () => {
    expect(sessionPerson("a@b.com")).toBe("team");
    expect(sessionPerson(null)).toBe("member");
  });
});
