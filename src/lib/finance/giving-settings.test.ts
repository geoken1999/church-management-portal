import { describe, expect, it } from "vitest";
import { validateGivingSettings } from "@/lib/finance/giving-settings";

const ok = { financeError: null, ownAllowedError: null, ownConnected: true };

describe("validateGivingSettings", () => {
  it("accepts shared mode with types", () => {
    expect(validateGivingSettings({ enabled: true, mode: "shared", types: ["tithe", "x"] }, ok)).toEqual({ value: { enabled: true, mode: "shared", types: ["tithe"] } });
  });
  it("needs a gateway and at least one type when turned on", () => {
    expect(validateGivingSettings({ enabled: true, mode: null, types: ["tithe"] }, ok)).toHaveProperty("error");
    expect(validateGivingSettings({ enabled: true, mode: "shared", types: [] }, ok)).toHaveProperty("error");
  });
  it("needs the Finance plan", () => {
    expect(validateGivingSettings({ enabled: true, mode: "shared", types: ["tithe"] }, { ...ok, financeError: "Finance isn't included." })).toEqual({ error: "Finance isn't included." });
  });
  it("needs a connected account for the church's own gateway", () => {
    expect(validateGivingSettings({ enabled: true, mode: "own", types: ["tithe"] }, { ...ok, ownConnected: false })).toHaveProperty("error");
    expect(validateGivingSettings({ enabled: true, mode: "own", types: ["tithe"] }, { ...ok, ownAllowedError: "Not on your plan." })).toEqual({ error: "Not on your plan." });
  });
  it("lets giving be turned off without any checks", () => {
    expect(validateGivingSettings({ enabled: false, mode: null, types: [] }, { ...ok, financeError: "x" })).toEqual({ value: { enabled: false, mode: null, types: [] } });
  });
});
