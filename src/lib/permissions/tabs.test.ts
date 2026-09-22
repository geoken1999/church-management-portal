import { describe, it, expect } from "vitest";
import {
  TAB_KEYS,
  TAB_LABELS,
  fullTabAccess,
  readOnlyTabAccess,
  noTabAccess,
  allFullTabAccess,
  defaultMemberTabPermissions,
  normalizeTabPermissions,
} from "./tabs";

// This session added three new tabs (attendance, folder, reports) — these
// checks guard the specific regressions that would break: the tab missing
// from the registry entirely, or present in TAB_KEYS but missing its label
// (which would render a blank nav item / permission-matrix row).
describe("TAB_KEYS additions from this session's modules", () => {
  it.each(["attendance", "folder", "reports"])("includes the '%s' tab", (tab) => {
    expect(TAB_KEYS).toContain(tab);
  });

  it("has no duplicate tab keys", () => {
    expect(new Set(TAB_KEYS).size).toBe(TAB_KEYS.length);
  });

  it("has a label for every tab key, and no orphaned labels", () => {
    const labelKeys = Object.keys(TAB_LABELS).sort();
    expect(labelKeys).toEqual([...TAB_KEYS].sort());
  });
});

describe("access level constructors", () => {
  it("fullTabAccess grants read, write, and delete", () => {
    expect(fullTabAccess()).toEqual({ read: true, write: true, delete: true });
  });

  it("readOnlyTabAccess grants only read", () => {
    expect(readOnlyTabAccess()).toEqual({ read: true, write: false, delete: false });
  });

  it("noTabAccess grants nothing", () => {
    expect(noTabAccess()).toEqual({ read: false, write: false, delete: false });
  });
});

describe("allFullTabAccess", () => {
  it("grants full access on every tab, including the newly added ones", () => {
    const access = allFullTabAccess();
    for (const tab of TAB_KEYS) {
      expect(access[tab]).toEqual({ read: true, write: true, delete: true });
    }
  });
});

describe("defaultMemberTabPermissions", () => {
  it("starts every tab, including new ones, as read-only", () => {
    const access = defaultMemberTabPermissions();
    for (const tab of TAB_KEYS) {
      expect(access[tab]).toEqual({ read: true, write: false, delete: false });
    }
  });
});

describe("normalizeTabPermissions", () => {
  it("falls back to read-only defaults for a null stored value", () => {
    expect(normalizeTabPermissions(null)).toEqual(defaultMemberTabPermissions());
  });

  it("falls back to read-only defaults for an undefined stored value", () => {
    expect(normalizeTabPermissions(undefined)).toEqual(defaultMemberTabPermissions());
  });

  it("merges an explicit grant on one tab while leaving the rest at the read-only default", () => {
    const result = normalizeTabPermissions({ folder: { read: true, write: true, delete: false } });
    expect(result.folder).toEqual({ read: true, write: true, delete: false });
    expect(result.attendance).toEqual({ read: true, write: false, delete: false });
    expect(result.reports).toEqual({ read: true, write: false, delete: false });
  });

  it("ignores keys in the stored value that aren't real tabs", () => {
    const result = normalizeTabPermissions({ notARealTab: { read: true, write: true, delete: true } } as never);
    expect(result).toEqual(defaultMemberTabPermissions());
  });

  it("simulates a pre-attendance/folder/reports row: those tabs still resolve to the read-only default", () => {
    // A row saved before this session's tabs existed would have tab_permissions
    // with no "attendance"/"folder"/"reports" key at all — exactly what a
    // partial legacy record looks like.
    const legacyStored = { members: { read: true, write: true, delete: true } };
    const result = normalizeTabPermissions(legacyStored);
    expect(result.members).toEqual({ read: true, write: true, delete: true });
    expect(result.attendance).toEqual(readOnlyTabAccess());
    expect(result.folder).toEqual(readOnlyTabAccess());
    expect(result.reports).toEqual(readOnlyTabAccess());
  });

  it("coerces non-boolean truthy/falsy values on a known tab rather than crashing", () => {
    const result = normalizeTabPermissions({ folder: { read: 1, write: 0, delete: "" } } as never);
    expect(result.folder).toEqual({ read: true, write: false, delete: false });
  });
});
