import { describe, expect, it } from "vitest";
import { readFollowupConfig, validateFollowupConfig } from "@/lib/automations/followup-config";

const VALID = {
  requiredConsecutive: 3,
  runWeekday: 1,
  assigneeUserId: "user-1",
  dueWorkingDays: 2,
  priority: "normal",
};

describe("validateFollowupConfig", () => {
  it("accepts a complete, in-range config", () => {
    expect(validateFollowupConfig(VALID)).toEqual({});
  });

  it("rejects a consecutive count outside 2-12", () => {
    expect(validateFollowupConfig({ ...VALID, requiredConsecutive: 1 }).requiredConsecutive).toBeDefined();
    expect(validateFollowupConfig({ ...VALID, requiredConsecutive: 13 }).requiredConsecutive).toBeDefined();
    expect(validateFollowupConfig({ ...VALID, requiredConsecutive: 2.5 }).requiredConsecutive).toBeDefined();
  });

  it("accepts the bounds 2 and 12", () => {
    expect(validateFollowupConfig({ ...VALID, requiredConsecutive: 2 })).toEqual({});
    expect(validateFollowupConfig({ ...VALID, requiredConsecutive: 12 })).toEqual({});
  });

  it("rejects a weekday outside 0-6", () => {
    expect(validateFollowupConfig({ ...VALID, runWeekday: 7 }).runWeekday).toBeDefined();
    expect(validateFollowupConfig({ ...VALID, runWeekday: -1 }).runWeekday).toBeDefined();
  });

  it("requires an assignee", () => {
    expect(validateFollowupConfig({ ...VALID, assigneeUserId: "" }).assigneeUserId).toBeDefined();
  });

  it("limits due working days to 0-14", () => {
    expect(validateFollowupConfig({ ...VALID, dueWorkingDays: 15 }).dueWorkingDays).toBeDefined();
    expect(validateFollowupConfig({ ...VALID, dueWorkingDays: 0 })).toEqual({});
  });

  it("rejects an unknown priority", () => {
    expect(validateFollowupConfig({ ...VALID, priority: "urgent" }).priority).toBeDefined();
  });
});

describe("readFollowupConfig", () => {
  const STORED = {
    requiredConsecutive: 4,
    runWeekday: 1,
    branchIds: null,
    assigneeUserId: "user-1",
    dueWorkingDays: 2,
    priority: "high",
  };

  it("reads a stored config", () => {
    expect(readFollowupConfig(STORED)).toEqual(STORED);
  });

  it("returns null when a required field is missing", () => {
    expect(readFollowupConfig({ ...STORED, assigneeUserId: undefined })).toBeNull();
    expect(readFollowupConfig({})).toBeNull();
  });

  it("falls back to normal priority and all branches for unrecognised values", () => {
    const result = readFollowupConfig({ ...STORED, priority: "urgent", branchIds: "branch-1" });
    expect(result?.priority).toBe("normal");
    expect(result?.branchIds).toBeNull();
  });

  it("keeps a valid list of branch ids", () => {
    expect(readFollowupConfig({ ...STORED, branchIds: ["a", "b"] })?.branchIds).toEqual(["a", "b"]);
  });
});
