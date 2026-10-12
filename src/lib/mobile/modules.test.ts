import { describe, expect, it } from "vitest";
import { MODULES, isModuleKey, parseModuleInput } from "@/lib/mobile/modules";

const today = "2026-10-12";
const id = "11111111-1111-4111-8111-111111111111";

describe("parseModuleInput", () => {
  it("builds a row, with empty optional fields as null", () => {
    const result = parseModuleInput(MODULES.ministries, { title: " Sunday School ", type: "", startedOn: "2020-01-05" }, "create", today);
    expect(result).toEqual({
      row: { title: "Sunday School", type: null, managed_by: null, vision: null, mission: null, started_on: "2020-01-05", future_plans: null },
    });
  });
  it("requires required fields and minimum lengths", () => {
    expect(parseModuleInput(MODULES.worship, { memberId: id, role: "" }, "create", today)).toEqual({ error: "Role is required." });
    expect(parseModuleInput(MODULES.worship, { memberId: id, role: "x" }, "create", today)).toHaveProperty("error");
  });
  it("leaves the person alone on an update", () => {
    const result = parseModuleInput(MODULES.media, { memberId: id, role: "Camera", notes: "" }, "update", today);
    expect(result).toEqual({ row: { role: "Camera", notes: null } });
  });
  it("checks amounts and dates", () => {
    expect(parseModuleInput(MODULES.offerings, { category: "Tithe", amount: "0", collectedOn: today }, "create", today)).toHaveProperty("error");
    expect(parseModuleInput(MODULES.offerings, { category: "Tithe", amount: "100", collectedOn: "2026-10-13" }, "create", today)).toEqual({ error: "Date can't be in the future." });
    expect(parseModuleInput(MODULES.offerings, { category: "Tithe", amount: "100.456", collectedOn: today }, "create", today)).toMatchObject({ row: { amount: 100.46 } });
  });
  it("needs a donor, by member or name", () => {
    expect(parseModuleInput(MODULES.donations, { amount: "50", donatedOn: today }, "create", today)).toEqual({ error: "Select a member or enter a donor name." });
    expect(parseModuleInput(MODULES.donations, { donorName: "A guest", amount: "50", donatedOn: today, method: "cash" }, "create", today)).toHaveProperty("row");
    expect(parseModuleInput(MODULES.donations, { donorName: "A", amount: "50", donatedOn: today, method: "bitcoin" }, "create", today)).toHaveProperty("error");
  });
  it("keeps a fundraiser's end date after its start", () => {
    const input = { title: "Roof", goalAmount: "5000", startDate: "2026-10-10", endDate: "2026-10-01" };
    expect(parseModuleInput(MODULES.fundraisers, input, "create", today)).toEqual({ error: "End date can't be before the start date." });
  });
  it("rejects a bad id for a reference field", () => {
    expect(parseModuleInput(MODULES.ministries, { title: "Kids", managedBy: "nope" }, "create", today)).toEqual({ error: "Managed by isn't valid." });
  });
  it("records an expense and keeps a category's type fixed once created", () => {
    const input = { categoryId: id, amount: "250", expenseDate: today, paymentMethod: "cash", payee: "Sound Co" };
    expect(parseModuleInput(MODULES.expenses, input, "create", today)).toMatchObject({ row: { amount: 250, payee: "Sound Co", category_id: id } });
    expect(parseModuleInput(MODULES.accounting_categories, { name: "Rent", type: "expense" }, "update", today)).toEqual({ row: { name: "Rent" } });
    expect(parseModuleInput(MODULES.accounting_categories, { name: "Rent", type: "other" }, "create", today)).toEqual({ error: "Type isn't valid." });
  });
  it("knows its modules", () => {
    expect(isModuleKey("offerings")).toBe(true);
    expect(isModuleKey("users")).toBe(false);
    expect(isModuleKey("toString")).toBe(false);
  });
});
