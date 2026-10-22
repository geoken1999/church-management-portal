import { describe, expect, it } from "vitest";
import {
  ONBOARDING_DOCS,
  ONBOARDING_MODULES,
  cleanCredits,
  quoteFor,
  tabStatesFor,
  MANDATE_LIMIT_RUPEES,
  isValidMembersCount,
  membersPrice,
  snapMembersCount,
  stepMembersCount,
} from "@/lib/onboarding/config";

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
    expect(
      tabs.fundraisers && tabs.offerings && tabs.donations && tabs.accounting,
    ).toBe(true);
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
    expect(
      quoteFor(["members"], { members: MANDATE_LIMIT_RUPEES }).overMandateLimit,
    ).toBe(true);
  });

  it("adds credit allowances to the quote", () => {
    const q = quoteFor(
      ["members"],
      { members: 500 },
      { sms: { count: 5000, price: 300 }, email: { count: 20000, price: 200 } },
    );
    expect(q.base).toBe(1000);
    expect(q.total).toBe(1180);
  });

  it("keeps only credits with a count and a price", () => {
    expect(
      cleanCredits({
        sms: { count: "5000", price: "300" },
        email: { count: 0, price: 5 },
        ai: { count: 10, price: -1 },
        junk: { count: 1, price: 1 },
      }),
    ).toEqual({
      sms: { count: 5000, price: 300 },
    });
  });
});

describe("members in a custom plan", () => {
  it("includes 350 and charges ₹30 for each further 100", () => {
    expect(membersPrice(350)).toBe(0);
    expect(membersPrice(450)).toBe(30);
    expect(membersPrice(1050)).toBe(210);
  });
  it("only allows 350, 450, 550 and so on", () => {
    expect(isValidMembersCount(350)).toBe(true);
    expect(isValidMembersCount(450)).toBe(true);
    expect(isValidMembersCount(400)).toBe(false);
    expect(isValidMembersCount(250)).toBe(false);
    expect(isValidMembersCount(350.5)).toBe(false);
  });
  it("moves in steps of 100 and never below the 350 included", () => {
    expect(stepMembersCount(350, 1)).toBe(450);
    expect(stepMembersCount(450, -1)).toBe(350);
    expect(stepMembersCount(350, -1)).toBe(350);
    expect(snapMembersCount(499)).toBe(450);
    expect(snapMembersCount(100)).toBe(350);
    expect(snapMembersCount(Number.NaN)).toBe(350);
  });
  it("works out the price from the count, whatever price is sent", () => {
    expect(cleanCredits({ members: { count: 650, price: 1 } }).members).toEqual(
      { count: 650, price: 90 },
    );
    expect(
      cleanCredits({ members: { count: 499, price: 5000 } }).members,
    ).toEqual({ count: 450, price: 30 });
    // Fewer than the 350 included is "nothing chosen": the plan's 350 apply.
    expect(
      cleanCredits({ members: { count: 100, price: 0 } }).members,
    ).toBeUndefined();
    expect(
      cleanCredits({ members: { count: 0, price: 10 } }).members,
    ).toBeUndefined();
  });
  it("still allows no limit, priced by hand", () => {
    expect(
      cleanCredits({ members: { unlimited: true, price: 999 } }).members,
    ).toEqual({ count: 0, unlimited: true, price: 999 });
  });
  it("adds the member blocks to the quote", () => {
    const credits = cleanCredits({ members: { count: 750 } });
    expect(quoteFor([], {}, credits).base).toBe(120);
  });
});

describe("onboarding documents", () => {
  it("makes exactly two mandatory: a personal ID proof and an address proof", () => {
    const required = ONBOARDING_DOCS.filter((d) => d.required);
    expect(required.map((d) => d.label)).toEqual([
      "Personal ID proof",
      "Address proof",
    ]);
    expect(ONBOARDING_DOCS.filter((d) => !d.required).length).toBeGreaterThan(
      0,
    );
  });
  it("keeps the stored type of the ID proof, so earlier uploads still count", () => {
    expect(
      ONBOARDING_DOCS.some((d) => d.type === "signatory_id" && d.required),
    ).toBe(true);
  });
});
