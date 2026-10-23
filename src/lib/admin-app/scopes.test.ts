import { describe, expect, it } from "vitest";
import { ADMIN_SCOPES, GRANTABLE_SCOPES, cleanScopes, hasScope, isAdminScope } from "./scopes";

describe("admin app scopes", () => {
  it("knows its scopes and nothing else", () => {
    expect(isAdminScope("tickets")).toBe(true);
    expect(isAdminScope("everything")).toBe(false);
    expect(isAdminScope(5)).toBe(false);
  });
  it("cleans a stored list: unknown scopes dropped, duplicates merged", () => {
    expect(cleanScopes(["tickets", "tickets", "nope", "health"])).toEqual([
      "tickets",
      "health",
    ]);
    expect(cleanScopes(null)).toEqual([]);
    expect(cleanScopes("tickets")).toEqual([]);
  });
  it("checks one scope at a time", () => {
    expect(hasScope(["tickets"], "tickets")).toBe(true);
    expect(hasScope(["tickets"], "billing")).toBe(false);
    expect(hasScope([...ADMIN_SCOPES], "billing")).toBe(true);
  });
  it("keeps managing users for platform owners: it can't be granted", () => {
    expect(ADMIN_SCOPES).toContain("users");
    expect(GRANTABLE_SCOPES).not.toContain("users");
    expect(GRANTABLE_SCOPES).toContain("finance");
  });
});
