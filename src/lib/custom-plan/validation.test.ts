import { describe, it, expect } from "vitest";
import { validateCustomPlanRequest } from "./validation";

describe("validateCustomPlanRequest", () => {
  const valid = { churchName: "Grace Community Church", email: "pastor@example.com", phone: "+1 555 0100" };

  it("accepts a fully filled-in request", () => {
    expect(validateCustomPlanRequest(valid)).toEqual({});
  });

  it("requires a church name", () => {
    expect(validateCustomPlanRequest({ ...valid, churchName: "" }).churchName).toBeDefined();
  });

  it("requires a valid email", () => {
    expect(validateCustomPlanRequest({ ...valid, email: "" }).email).toBeDefined();
    expect(validateCustomPlanRequest({ ...valid, email: "not-an-email" }).email).toBeDefined();
  });

  it("requires a phone number", () => {
    expect(validateCustomPlanRequest({ ...valid, phone: "" }).phone).toBeDefined();
  });
});
