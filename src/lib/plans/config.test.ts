import { describe, it, expect } from "vitest";
import { ADDON_PACKS, getAddonPack, addonPacksFor, kaudioMaxDurationMinutes, PLANS } from "./config";

describe("kaudioMaxDurationMinutes", () => {
  it("adds 10 minutes to a finite K-meet limit", () => {
    expect(kaudioMaxDurationMinutes(PLANS.basic)).toBe(30); // basic: 20 -> 30
    expect(kaudioMaxDurationMinutes(PLANS.premium)).toBe(50); // premium: 40 -> 50
  });

  it("stays unlimited when K-meet's limit is unlimited", () => {
    expect(kaudioMaxDurationMinutes(PLANS.pro)).toBeNull(); // pro: null -> null
  });
});

describe("PLANS.basic (Starter)", () => {
  it("prices at ₹1,499/month and an explicit ₹14,999/year (not the formula-rounded ₹14,990)", () => {
    expect(PLANS.basic.priceInRupees).toBe(1499);
    expect(PLANS.basic.priceInRupeesAnnual).toBe(14999);
    expect(PLANS.basic.priceLabel).toBe("₹1,499/month");
    expect(PLANS.basic.priceLabelAnnual).toBe("₹14,999/year");
  });

  it("enforces the shared-gateway-only, Finance-still-enabled rule", () => {
    expect(PLANS.basic.financeEnabled).toBe(true);
    expect(PLANS.basic.ownPaymentGatewayEnabled).toBe(false);
  });

  it("splits the team quota into separate admin/staff caps", () => {
    expect(PLANS.basic.maxAdditionalAdmins).toBe(1);
    expect(PLANS.basic.maxAdditionalStaff).toBe(2);
  });

  it("caps branches, members, and forms", () => {
    expect(PLANS.basic.branchLimit).toBe(3);
    expect(PLANS.basic.memberLimit).toBe(350);
    expect(PLANS.basic.formsLimit).toBe(20);
  });

  it("disables Automation", () => {
    expect(PLANS.basic.automationLimit).toBe(0);
  });
});

describe("PLANS.premium (Growth)", () => {
  it("prices at ₹2,999/month and an explicit ₹29,999/year", () => {
    expect(PLANS.premium.priceInRupees).toBe(2999);
    expect(PLANS.premium.priceInRupeesAnnual).toBe(29999);
  });

  it("allows up to 5 automations at a time", () => {
    expect(PLANS.premium.automationLimit).toBe(5);
  });

  it("caps branches, members, and forms", () => {
    expect(PLANS.premium.branchLimit).toBe(10);
    expect(PLANS.premium.memberLimit).toBe(2000);
    expect(PLANS.premium.formsLimit).toBe(100);
  });

  it("allows its own payment gateway and SMTP", () => {
    expect(PLANS.premium.ownPaymentGatewayEnabled).toBe(true);
    expect(PLANS.premium.customSmtpEnabled).toBe(true);
  });
});

describe("PLANS.pro", () => {
  it("prices at ₹4,999/month and an explicit ₹49,999/year", () => {
    expect(PLANS.pro.priceInRupees).toBe(4999);
    expect(PLANS.pro.priceInRupeesAnnual).toBe(49999);
  });

  it("allows up to 10 automations at a time", () => {
    expect(PLANS.pro.automationLimit).toBe(10);
  });

  it("leaves K-meet/K-audio and forms unlimited, but caps branches/members", () => {
    expect(PLANS.pro.kmeetMaxDurationMinutes).toBeNull();
    expect(PLANS.pro.formsLimit).toBeNull();
    expect(PLANS.pro.branchLimit).toBe(20);
    expect(PLANS.pro.memberLimit).toBe(10000);
  });
});

describe("getAddonPack", () => {
  it("finds a pack by id", () => {
    expect(getAddonPack("sms_500")?.credits).toBe(500);
  });

  it("returns undefined for an unknown id", () => {
    expect(getAddonPack("bogus")).toBeUndefined();
  });
});

describe("addonPacksFor", () => {
  it("returns only packs of the requested type", () => {
    const smsPacks = addonPacksFor("sms");
    expect(smsPacks.length).toBeGreaterThan(0);
    expect(smsPacks.every((pack) => pack.addonType === "sms")).toBe(true);
  });

  it("covers every addon type with at least one pack", () => {
    for (const type of ["sms", "email", "whatsapp", "storage"] as const) {
      expect(addonPacksFor(type).length).toBeGreaterThan(0);
    }
  });
});

describe("ADDON_PACKS", () => {
  it("has unique ids", () => {
    const ids = ADDON_PACKS.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every pack has a positive price and credit amount", () => {
    for (const pack of ADDON_PACKS) {
      expect(pack.priceInRupees).toBeGreaterThan(0);
      expect(pack.credits).toBeGreaterThan(0);
    }
  });
});
