import { describe, expect, it } from "vitest";
import { gstBreakdown, withGst } from "@/lib/billing/gst";
import {
  cleanBillingDetails,
  EMPTY_BILLING_DETAILS,
  validateBillingDetails,
} from "@/lib/billing/billing-details";

describe("GST", () => {
  it("adds 18% to a price", () => {
    expect(withGst(1499)).toEqual({ base: 1499, gst: 269.82, total: 1768.82 });
    expect(withGst(399)).toEqual({ base: 399, gst: 71.82, total: 470.82 });
    expect(withGst(4999).total).toBe(5898.82);
  });
  it("splits into CGST and SGST inside the seller's state", () => {
    const b = gstBreakdown(1499, "Maharashtra", "maharashtra");
    expect(b).toMatchObject({
      intraState: true,
      igst: 0,
      cgst: 134.91,
      sgst: 134.91,
      gst: 269.82,
      total: 1768.82,
    });
  });
  it("uses IGST between states, and the parts always add up", () => {
    const b = gstBreakdown(1499, "Kerala", "Maharashtra");
    expect(b).toMatchObject({
      intraState: false,
      cgst: 0,
      sgst: 0,
      igst: 269.82,
    });
    for (const price of [399, 499, 1199, 1399, 1699, 2999, 14999]) {
      const x = gstBreakdown(price, "Tamil Nadu", "Tamil Nadu");
      expect(Math.round((x.base + x.cgst + x.sgst) * 100)).toBe(
        Math.round(x.total * 100),
      );
    }
  });
  it("treats an unknown state as IGST", () => {
    expect(gstBreakdown(100, null, "Maharashtra").igst).toBe(18);
  });
});

describe("billing details", () => {
  const good = {
    ...EMPTY_BILLING_DETAILS,
    legalName: "Grace Church",
    addressLine1: "12 Church Road",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    email: "Admin@Grace.test",
  };
  it("accepts complete details, with or without a GSTIN", () => {
    expect(validateBillingDetails(good)).toEqual({});
    expect(
      validateBillingDetails({ ...good, gstin: "27ABCDE1234F1Z5" }),
    ).toEqual({});
  });
  it("asks for what's missing", () => {
    const errors = validateBillingDetails(EMPTY_BILLING_DETAILS);
    expect(Object.keys(errors).sort()).toEqual([
      "addressLine1",
      "city",
      "email",
      "legalName",
      "pincode",
      "state",
    ]);
  });
  it("checks a GSTIN's shape and that its state code matches the state", () => {
    expect(validateBillingDetails({ ...good, gstin: "ABC" }).gstin).toMatch(
      /15 characters/,
    );
    expect(
      validateBillingDetails({ ...good, gstin: "29ABCDE1234F1Z5" }).gstin,
    ).toMatch(/state code 29/);
  });
  it("tidies what was typed", () => {
    expect(
      cleanBillingDetails({
        ...good,
        gstin: " 27abcde1234f1z5 ",
        state: "maharashtra",
      }),
    ).toMatchObject({
      gstin: "27ABCDE1234F1Z5",
      state: "Maharashtra",
      email: "admin@grace.test",
    });
  });
});
