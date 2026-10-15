import { describe, expect, it } from "vitest";
import { ONBOARDING_MODULES, quoteFor, tabStatesFor, MANDATE_LIMIT_RUPEES } from "@/lib/onboarding/config";

describe("onboarding modules", () => {
  it("groups finance and social media into one module each", () => {
    const keys = ONBOARDING_MODULES.map((m) => m.key);
    expect(keys).toContain("finance");
    expect(keys).toContain("social");
    expect(keys).not.toContain("offerings");
    expect(keys).not.toContain("youtube");
  });

  it("switches a module's tabs together, and everything else off", () => {
    const tabs = tabStatesFor(["finance", "members"]);
    expect(tabs.fundraisers && tabs.offerings && tabs.donations && tabs.accounting).toBe(true);
    expect(tabs.members).toBe(true);
    expect(tabs.instagram).toBe(false);
    expect(tabs.sms).toBe(false);
  });

  it("quotes the total with 18% GST and flags the UPI Autopay limit", () => {
    const q = quoteFor(["members", "events"], { members: 500, events: 300 });
    expect(q.base).toBe(800);
    expect(q.gst).toBe(144);
    expect(q.total).toBe(944);
    expect(q.overMandateLimit).toBe(false);
    expect(quoteFor(["members"], { members: MANDATE_LIMIT_RUPEES }).overMandateLimit).toBe(true);
  });
});
