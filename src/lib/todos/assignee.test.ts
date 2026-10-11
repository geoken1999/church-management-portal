import { describe, it, expect } from "vitest";
import { assigneeValue, parseAssignee } from "./assignee";

const ID = "11111111-1111-1111-1111-111111111111";

describe("parseAssignee", () => {
  it("reads unassigned, a team member and a leader", () => {
    expect(parseAssignee("")).toEqual({ kind: "none" });
    expect(parseAssignee(`u:${ID}`)).toEqual({ kind: "user", id: ID });
    expect(parseAssignee(`m:${ID}`)).toEqual({ kind: "leader", id: ID });
  });

  it("rejects anything malformed", () => {
    expect(parseAssignee("x:1")).toBeNull();
    expect(parseAssignee(`u:not-a-uuid`)).toBeNull();
    expect(parseAssignee(ID)).toBeNull();
  });
});

describe("assigneeValue", () => {
  it("round-trips with parseAssignee", () => {
    expect(assigneeValue(ID, null)).toBe(`u:${ID}`);
    expect(assigneeValue(null, ID)).toBe(`m:${ID}`);
    expect(assigneeValue(null, null)).toBe("");
  });
});
