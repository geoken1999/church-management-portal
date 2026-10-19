import { describe, expect, it } from "vitest";
import { resolvedAtFor, validateTicket } from "./validation";
import { ticketKey } from "./constants";

const ok = {
  type: "bug",
  title: "Bell does not open",
  description: "",
  status: "open",
  priority: "medium",
  area: "mobile",
  assignee: "",
  release: "",
  references: "",
};

describe("validateTicket", () => {
  it("accepts a normal ticket", () => expect(validateTicket(ok)).toEqual({}));
  it("rejects bad values", () => {
    const e = validateTicket({
      ...ok,
      title: "ab",
      type: "idea",
      status: "x",
      priority: "now",
      area: "Bad Area",
    });
    expect(Object.keys(e).sort()).toEqual([
      "area",
      "priority",
      "status",
      "title",
      "type",
    ]);
  });
  it("limits long text", () => {
    expect(
      validateTicket({ ...ok, description: "x".repeat(8001) }).description,
    ).toBeDefined();
  });
});

describe("resolvedAtFor", () => {
  const now = new Date("2026-10-19T10:00:00Z");
  it("stamps the moment a ticket is finished", () => {
    expect(resolvedAtFor("open", "done", null, now)).toBe(now.toISOString());
  });
  it("keeps the first finish time when moving between finished statuses", () => {
    expect(
      resolvedAtFor("done", "closed", "2026-10-01T00:00:00.000Z", now),
    ).toBe("2026-10-01T00:00:00.000Z");
  });
  it("clears it when reopened", () => {
    expect(
      resolvedAtFor("done", "open", "2026-10-01T00:00:00.000Z", now),
    ).toBeNull();
  });
});

it("builds the ticket key", () => expect(ticketKey(12)).toBe("KF-12"));
