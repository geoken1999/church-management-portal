import { describe, it, expect } from "vitest";
import { validatePayoutDetails } from "./payout-details";

describe("validatePayoutDetails", () => {
  const validUpi = {
    payoutMethod: "upi",
    upiId: "church@upi",
    bankAccountHolder: "",
    bankAccountNumber: "",
    bankIfsc: "",
    bankName: "",
  };
  const validBank = {
    payoutMethod: "bank_transfer",
    upiId: "",
    bankAccountHolder: "Grace Community Church",
    bankAccountNumber: "1234567890",
    bankIfsc: "HDFC0001234",
    bankName: "HDFC Bank",
  };

  it("accepts a valid UPI config", () => {
    expect(validatePayoutDetails(validUpi)).toEqual({});
  });

  it("accepts a valid bank transfer config", () => {
    expect(validatePayoutDetails(validBank)).toEqual({});
  });

  it("rejects an invalid payout method", () => {
    expect(validatePayoutDetails({ ...validUpi, payoutMethod: "cash" }).payoutMethod).toBeDefined();
  });

  it("rejects UPI with no UPI ID", () => {
    expect(validatePayoutDetails({ ...validUpi, upiId: "" }).upiId).toBeDefined();
  });

  it("rejects bank transfer missing any one of the four bank fields", () => {
    expect(validatePayoutDetails({ ...validBank, bankAccountHolder: "" }).bankAccountHolder).toBeDefined();
    expect(validatePayoutDetails({ ...validBank, bankAccountNumber: "" }).bankAccountNumber).toBeDefined();
    expect(validatePayoutDetails({ ...validBank, bankIfsc: "" }).bankIfsc).toBeDefined();
    expect(validatePayoutDetails({ ...validBank, bankName: "" }).bankName).toBeDefined();
  });
});
