import { describe, it, expect } from "vitest";
import { validateInvoice } from "./validation";

function baseInput(overrides: Partial<Parameters<typeof validateInvoice>[0]> = {}) {
  return {
    billToName: "Jane Doe",
    issueDate: "2026-01-01",
    taxRate: "0",
    items: [{ description: "Hall rental", quantity: "1", unitPrice: "500" }],
    ...overrides,
  };
}

describe("validateInvoice", () => {
  it("accepts a valid invoice", () => {
    expect(validateInvoice(baseInput())).toEqual({});
  });

  it("rejects a missing bill-to name", () => {
    expect(validateInvoice(baseInput({ billToName: "" })).billToName).toBeDefined();
  });

  it("rejects a one-character bill-to name", () => {
    expect(validateInvoice(baseInput({ billToName: "J" })).billToName).toBeDefined();
  });

  it("rejects a missing issue date", () => {
    expect(validateInvoice(baseInput({ issueDate: "" })).issueDate).toBeDefined();
  });

  it("rejects a tax rate outside 0-100", () => {
    expect(validateInvoice(baseInput({ taxRate: "150" })).taxRate).toBeDefined();
    expect(validateInvoice(baseInput({ taxRate: "-5" })).taxRate).toBeDefined();
  });

  it("accepts an empty tax rate (treated as 0)", () => {
    expect(validateInvoice(baseInput({ taxRate: "" })).taxRate).toBeUndefined();
  });

  it("rejects zero line items (blank descriptions filtered out)", () => {
    expect(validateInvoice(baseInput({ items: [{ description: "", quantity: "1", unitPrice: "10" }] })).items).toBeDefined();
  });

  it("rejects a line item with zero or negative quantity", () => {
    expect(validateInvoice(baseInput({ items: [{ description: "Item", quantity: "0", unitPrice: "10" }] })).items).toBeDefined();
  });

  it("rejects a line item with a negative unit price", () => {
    expect(validateInvoice(baseInput({ items: [{ description: "Item", quantity: "1", unitPrice: "-10" }] })).items).toBeDefined();
  });

  it("accepts a zero unit price (e.g. a free line item)", () => {
    expect(validateInvoice(baseInput({ items: [{ description: "Free gift", quantity: "1", unitPrice: "0" }] })).items).toBeUndefined();
  });

  it("ignores blank rows among otherwise-valid line items", () => {
    const result = validateInvoice(
      baseInput({
        items: [
          { description: "Hall rental", quantity: "1", unitPrice: "500" },
          { description: "", quantity: "1", unitPrice: "" },
        ],
      }),
    );
    expect(result.items).toBeUndefined();
  });
});
