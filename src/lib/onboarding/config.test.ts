import { describe, expect, it } from "vitest";
import { EXTRA_PRICING } from "@/lib/plans/config";
import {
  ONBOARDING_DOCS,
  CREDIT_TYPES,
  creditPrice,
  snapCount,
  stepCount,
  steppedRule,
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

  it("keeps only credits with a usable count, pricing block-sold ones itself", () => {
    expect(
      cleanCredits({
        sms: { count: "5000", price: "300" },
        email: { count: 0, price: 5 },
        ai: { count: 10, price: -1 },
        kmeet: { count: 45, price: 80 },
        junk: { count: 1, price: 1 },
      }),
    ).toEqual({
      // 5000 SMS: 50 included, so 4,950 more is 247 whole blocks of 20 (4,940): 4,990 SMS at 247 x ₹30.
      sms: { count: 4990, price: 7410 },
      // K-Connect is priced by hand.
      kmeet: { count: 45, price: 80 },
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

describe("limits sold in blocks above Starter", () => {
  it("prices each limit per block, at the add-on rates", () => {
    expect(creditPrice("storage", 40)).toBe(50); // 20 GB included, +20 GB
    expect(creditPrice("storage", 20)).toBe(0);
    expect(creditPrice("branches", 5)).toBe(20); // 3 included, 2 more at ₹10
    expect(creditPrice("forms", 40)).toBe(40); // 20 included, 2 blocks of 10 at ₹20
    expect(creditPrice("groups", 6)).toBe(60); // 3 included, 3 at ₹20
    expect(creditPrice("admins", 3)).toBe(40); // 1 included, 2 at ₹20
    expect(creditPrice("staff", 6)).toBe(20); // 2 included, 4 at ₹5
    expect(creditPrice("instagram", 3)).toBe(100); // 1 included, 2 at ₹50
    expect(creditPrice("youtube", 2)).toBe(50);
    expect(creditPrice("email", 3000)).toBe(100); // 1000 included, 2 blocks of 1000 at ₹50
    expect(creditPrice("sms", 90)).toBe(60); // 50 included, 2 blocks of 20 at ₹30
    expect(creditPrice("whatsapp", 3500)).toBe(100); // 2500 included, 2 blocks of 500 at ₹50
    expect(creditPrice("ai", 300)).toBe(100); // 100 included, 2 blocks at ₹50
  });
  it("starts at Starter's number and moves a block at a time", () => {
    expect(steppedRule("storage")?.included).toBe(20);
    expect(stepCount("storage", 20, 1)).toBe(40);
    expect(stepCount("storage", 20, -1)).toBe(20);
    expect(stepCount("sms", 50, 1)).toBe(70);
    expect(stepCount("forms", 20, 1)).toBe(30);
    expect(stepCount("branches", 3, 1)).toBe(4);
    expect(snapCount("sms", 79)).toBe(70);
    expect(snapCount("email", 10)).toBe(1000);
  });
  it("sells the same blocks at the same price in the add-on packs", () => {
    expect(EXTRA_PRICING.sms).toEqual({ step: 20, price: 30 });
    expect(creditPrice("sms", 50 + EXTRA_PRICING.sms.step)).toBe(
      EXTRA_PRICING.sms.price,
    );
    expect(creditPrice("storage", 20 + EXTRA_PRICING.storageGb.step)).toBe(
      EXTRA_PRICING.storageGb.price,
    );
  });
  it("leaves K-Connect to be priced by hand and mobile features out of the list", () => {
    expect(steppedRule("kmeet")).toBeNull();
    expect(
      CREDIT_TYPES.some((t) => (t.key as string) === "mobileFeatures"),
    ).toBe(false);
  });
});
