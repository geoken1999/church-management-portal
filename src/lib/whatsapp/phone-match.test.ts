import { describe, expect, it } from "vitest";
import { isSameNumber, nationalTail } from "@/lib/whatsapp/phone-match";

describe("isSameNumber", () => {
  it("matches a full international sender to a number saved without the country code", () => {
    expect(isSameNumber("+918879356390", "8879356390")).toBe(true);
  });

  it("matches a number saved with a leading 0", () => {
    expect(isSameNumber("+918879356390", "08879356390")).toBe(true);
  });

  it("doesn't match a different number", () => {
    expect(isSameNumber("+918879356390", "7738835766")).toBe(false);
  });

  it("refuses to match when there aren't 10 digits to compare", () => {
    expect(isSameNumber("+91", "91")).toBe(false);
    expect(nationalTail("12")).toBe("12");
  });
});
