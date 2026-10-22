import { describe, expect, it } from "vitest";
import { renderPricingPdf } from "@/lib/onboarding/pricing-pdf";
import { ONBOARDING_MODULES } from "@/lib/onboarding/config";

describe("pricing sheet pdf", () => {
  const pdf = renderPricingPdf({
    modulePrices: Object.fromEntries(ONBOARDING_MODULES.map((m) => [m.key, 111])),
    generatedAt: new Date("2025-03-01T10:00:00Z"),
  });
  const text = pdf.toString("latin1");

  it("is a real PDF", () => {
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(pdf.length).toBeGreaterThan(5000);
  });
  it("carries the plans, the block prices and the add-on packs", () => {
    for (const word of ["Starter", "Growth", "Pro", "Price per month", "Chat groups", "Rs. 30", "Add-on packs", "SMS credits"]) {
      expect(text, word).toContain(word);
    }
  });
  it("shows the module prices it was given", () => {
    expect(text).toContain("Rs. 111");
  });
});
