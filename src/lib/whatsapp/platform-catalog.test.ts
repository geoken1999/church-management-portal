import { describe, it, expect } from "vitest";
import { PLATFORM_TEMPLATE_CATALOG, variableCountOf } from "./platform-catalog";

describe("platform template catalog", () => {
  it("has unique keys and valid, unique template names", () => {
    expect(new Set(PLATFORM_TEMPLATE_CATALOG.map((t) => t.key)).size).toBe(PLATFORM_TEMPLATE_CATALOG.length);
    expect(new Set(PLATFORM_TEMPLATE_CATALOG.map((t) => t.name)).size).toBe(PLATFORM_TEMPLATE_CATALOG.length);
    for (const t of PLATFORM_TEMPLATE_CATALOG) expect(t.name).toMatch(/^[a-z0-9_]+$/);
  });

  it("numbers variables 1..n in order and gives one example for each", () => {
    for (const t of PLATFORM_TEMPLATE_CATALOG) {
      const count = variableCountOf(t.body);
      expect(t.examples).toHaveLength(count);
      for (let i = 1; i <= count; i++) expect(t.body).toContain(`{{${i}}}`);
    }
  });

  it("does not read like a one-time code, which WhatsApp files as Authentication", () => {
    for (const t of PLATFORM_TEMPLATE_CATALOG) expect(t.body.toLowerCase()).not.toMatch(/\b(otp|verification|confirmation) code\b|\bcode is\b/);
  });
});

describe("WhatsApp placement rules", () => {
  // WhatsApp refuses a template that starts or ends with a variable, even if
  // only punctuation follows it ("Variables can't be at the start or end of
  // the template").
  it("never starts or ends with a variable", () => {
    for (const t of PLATFORM_TEMPLATE_CATALOG) {
      const trimmed = t.body.trim();
      expect(trimmed, `${t.name} starts with a variable`).not.toMatch(/^\{\{\d+\}\}/);
      expect(trimmed, `${t.name} ends with a variable`).not.toMatch(/\{\{\d+\}\}[\s.,!?;:]*$/);
    }
  });
});

describe("the new fee and follow-up templates", () => {
  const keys = ["membership_fee_request", "membership_fee_reminder", "followup_member", "followup_leader"];
  for (const key of keys) {
    const t = PLATFORM_TEMPLATE_CATALOG.find((x) => x.key === key);
    it(`${key} is well formed for WhatsApp`, () => {
      expect(t).toBeDefined();
      if (!t) return;
      expect(variableCountOf(t.body)).toBe(t.examples.length);
      // WhatsApp refuses a body that starts or ends with a variable.
      expect(/^\s*\{\{/.test(t.body)).toBe(false);
      expect(/\}\}\s*$/.test(t.body)).toBe(false);
      expect(t.name).toMatch(/^kf_[a-z_]+$/);
    });
  }
  it("has unique names", () => {
    const names = PLATFORM_TEMPLATE_CATALOG.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
