import { describe, it, expect } from "vitest";
import { ADDON_PACKS, getAddonPack, addonPacksFor } from "./config";

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
