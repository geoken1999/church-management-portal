import { describe, expect, it } from "vitest";
import { cleanDestination, destinationFor, detectPlatform, isBot, randomQrCode, QR_CODE_PATTERN } from "./links";
import { DEFAULT_QR_DESIGN, contrastRatio, normalizeDesign, renderQrSvg } from "./design";

describe("QR short links", () => {
  it("generates valid codes", () => {
    for (let i = 0; i < 50; i++) expect(randomQrCode()).toMatch(QR_CODE_PATTERN);
  });

  it("detects the platform from the user agent", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("desktop");
  });

  it("does not count link-preview robots", () => {
    expect(isBot("WhatsApp/2.23 A")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe(false);
  });

  it("only accepts http(s) destinations and never its own short links", () => {
    expect(cleanDestination("example.com/give")).toBe("https://example.com/give");
    expect(cleanDestination("javascript:alert(1)")).toBeNull();
    expect(cleanDestination("kingdomflow://x")).toBeNull();
    expect(cleanDestination("localhost")).toBeNull();
    expect(cleanDestination("https://www.kingdomflow.in/q/abc", "www.kingdomflow.in")).toBeNull();
    expect(cleanDestination("")).toBeNull();
  });

  it("uses the platform's own address, else the main one", () => {
    const t = { destination_url: "https://a.com/", ios_url: "https://apple.com/", android_url: null, desktop_url: null };
    expect(destinationFor(t, "ios")).toBe("https://apple.com/");
    expect(destinationFor(t, "android")).toBe("https://a.com/");
    expect(destinationFor(t, "desktop")).toBe("https://a.com/");
  });
});

describe("QR design", () => {
  it("falls back to defaults for bad input", () => {
    expect(normalizeDesign({ fg: "red", dots: "star", label: 5 })).toEqual(DEFAULT_QR_DESIGN);
  });

  it("renders every style as an SVG with an escaped label", () => {
    for (const dots of ["square", "rounded", "dots"] as const) {
      for (const eyes of ["square", "rounded", "circle"] as const) {
        const svg = renderQrSvg("https://x.com/q/abc", { ...DEFAULT_QR_DESIGN, dots, eyes, fg2: "#ff0000", label: 'A & <B>' });
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain("A &amp; &lt;B&gt;");
        expect(svg).not.toContain("<B>");
      }
    }
  });

  it("measures contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#888888")).toBeLessThan(2);
  });
});
