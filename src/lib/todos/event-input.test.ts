import { describe, expect, it } from "vitest";
import { parseTodoEvent } from "@/lib/todos/event-input";

describe("parseTodoEvent", () => {
  it("accepts a name with or without a date", () => {
    expect(parseTodoEvent(" Youth Camp ", "")).toEqual({ title: "Youth Camp", date: null });
    expect(parseTodoEvent("Youth Camp", "2026-12-01")).toEqual({ title: "Youth Camp", date: "2026-12-01" });
  });
  it("rejects bad names and dates", () => {
    expect(parseTodoEvent("A", "")).toHaveProperty("error");
    expect(parseTodoEvent("x".repeat(81), "")).toHaveProperty("error");
    expect(parseTodoEvent("Camp", "12/01/2026")).toHaveProperty("error");
  });
});
