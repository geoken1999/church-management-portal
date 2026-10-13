import { describe, expect, it } from "vitest";
import { DEFAULT_MENU_PREFS, parseMenuPrefs, serializeMenuPrefs } from "@/lib/menu-prefs";

describe("menu preferences", () => {
  it("default to collapsible sections, all open", () => {
    expect(parseMenuPrefs(undefined)).toEqual(DEFAULT_MENU_PREFS);
    expect(parseMenuPrefs("")).toEqual({ collapsible: true, closed: [] });
    expect(DEFAULT_MENU_PREFS).toEqual({ collapsible: true, closed: [] });
  });
  it("round-trip what was saved", () => {
    const saved = { collapsible: false, closed: ["finance", "tools"] };
    expect(parseMenuPrefs(serializeMenuPrefs(saved))).toEqual(saved);
  });
  it("only turn off when told to, and ignore junk", () => {
    expect(parseMenuPrefs(serializeMenuPrefs({ collapsible: true, closed: ["a"] })).collapsible).toBe(true);
    expect(parseMenuPrefs("not json")).toEqual(DEFAULT_MENU_PREFS);
    expect(parseMenuPrefs(encodeURIComponent(JSON.stringify({ closed: [1, "x", null] })))).toEqual({ collapsible: true, closed: ["x"] });
  });
});
