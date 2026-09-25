import { describe, it, expect } from "vitest";
import { SHARED_SERVICE_FEE_RATE, sharedServiceFee, sharedServiceNetAmount } from "./fees";

describe("SHARED_SERVICE_FEE_RATE", () => {
  it("is 2.5%", () => {
    expect(SHARED_SERVICE_FEE_RATE).toBe(0.025);
  });
});

describe("sharedServiceFee", () => {
  it("takes 2.5% of the collected amount", () => {
    expect(sharedServiceFee(1000)).toBe(25);
  });

  it("is 0 for 0 collected", () => {
    expect(sharedServiceFee(0)).toBe(0);
  });
});

describe("sharedServiceNetAmount", () => {
  it("subtracts the fee from the collected amount", () => {
    expect(sharedServiceNetAmount(1000)).toBe(975);
  });

  it("fee and net amount always sum back to the collected amount", () => {
    for (const amount of [1, 10, 100, 1234.56, 99999]) {
      expect(sharedServiceFee(amount) + sharedServiceNetAmount(amount)).toBeCloseTo(amount, 10);
    }
  });
});
