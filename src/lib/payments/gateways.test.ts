import { describe, expect, it } from "vitest";
import { cashfreeApiBase, isGateway, payuBaseUrl, validateGatewayCredentials } from "@/lib/payments/gateways";

describe("gateways", () => {
  it("recognises the three gateways", () => {
    expect(isGateway("cashfree")).toBe(true);
    expect(isGateway("stripe")).toBe(false);
  });
  it("needs both keys", () => {
    expect(validateGatewayCredentials("payu", { keyId: "", keySecret: "s", environment: "live" })).toHaveProperty("error");
    expect(validateGatewayCredentials("cashfree", { keyId: "a", keySecret: " ", environment: "live" })).toHaveProperty("error");
  });
  it("keeps test only where the gateway has one", () => {
    expect(validateGatewayCredentials("payu", { keyId: "a", keySecret: "b", environment: "test" })).toEqual({ keyId: "a", keySecret: "b", environment: "test" });
    expect(validateGatewayCredentials("razorpay", { keyId: "a", keySecret: "b", environment: "test" })).toEqual({ keyId: "a", keySecret: "b", environment: "live" });
  });
  it("picks the host by environment", () => {
    expect(payuBaseUrl("test")).toBe("https://test.payu.in");
    expect(payuBaseUrl("live")).toBe("https://secure.payu.in");
    expect(cashfreeApiBase("test")).toContain("sandbox");
    expect(cashfreeApiBase("live")).toBe("https://api.cashfree.com/pg");
  });
});
