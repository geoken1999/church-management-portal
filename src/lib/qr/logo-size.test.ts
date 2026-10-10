import { describe, it, expect } from "vitest";
import { clampQrLogoSize, qrLogoRatio } from "./logo-size";

describe("clampQrLogoSize", () => {
  it("keeps values in range and rounds", () => {
    expect(clampQrLogoSize(20)).toBe(20);
    expect(clampQrLogoSize(17.6)).toBe(18);
  });
  it("clamps out-of-range values and falls back for junk", () => {
    expect(clampQrLogoSize(2)).toBe(10);
    expect(clampQrLogoSize(80)).toBe(30);
    expect(clampQrLogoSize("abc")).toBe(20);
    expect(clampQrLogoSize(undefined)).toBe(20);
  });
});

describe("qrLogoRatio", () => {
  it("is a fraction of the QR width", () => {
    expect(qrLogoRatio(25)).toBe(0.25);
  });
});
