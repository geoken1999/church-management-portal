import { describe, expect, it } from "vitest";
import { buildRequestHashString, buildResponseHashString, sha512Hex } from "@/lib/payu/hash";

// Fixture-only key/salt — never PayU credentials, real or otherwise. These
// tests check the field order and the hashing primitive, not any specific
// account; the field order itself was verified separately against PayU's
// live test API (see hash.ts).
const FIXTURE = {
  key: "testkey123",
  txnid: "txn001",
  amount: "100.00",
  productinfo: "A test product",
  firstname: "Jane",
  email: "jane@example.com",
};
const SALT = "testsalt456";

describe("buildRequestHashString", () => {
  it("joins the six core fields, the five udf slots, five empty reserved slots, then the salt", () => {
    expect(buildRequestHashString(FIXTURE, SALT)).toBe(
      "testkey123|txn001|100.00|A test product|Jane|jane@example.com|||||||||||testsalt456",
    );
  });

  it("fills udf1-5 when given, still followed by exactly five empty reserved slots", () => {
    const withUdf = { ...FIXTURE, udf1: "a", udf2: "b", udf3: "c", udf4: "d", udf5: "e" };
    expect(buildRequestHashString(withUdf, SALT)).toBe(
      "testkey123|txn001|100.00|A test product|Jane|jane@example.com|a|b|c|d|e|||||" + "|testsalt456",
    );
  });

  it("has exactly 16 pipe separators for the 17-field sequence", () => {
    expect(buildRequestHashString(FIXTURE, SALT).split("|")).toHaveLength(17);
  });
});

describe("buildResponseHashString", () => {
  it("is the exact reverse of the request sequence, with status after the salt", () => {
    const withStatus = { ...FIXTURE, status: "success" };
    const built = buildResponseHashString(withStatus, SALT);
    const expectedReversedCore = [SALT, "success", "", "", "", "", "", "", "", "", "", "", "jane@example.com", "Jane", "A test product", "100.00", "txn001", "testkey123"].join("|");
    expect(built).toBe(expectedReversedCore);
  });

  it("has exactly 18 fields — one more than the request's 17, for the added status", () => {
    expect(buildResponseHashString({ ...FIXTURE, status: "success" }, SALT).split("|")).toHaveLength(18);
  });
});

describe("sha512Hex", () => {
  it("matches the published SHA-512 test vector for the empty string", () => {
    expect(sha512Hex("")).toBe(
      "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
    );
  });

  it("matches the published SHA-512 test vector for \"abc\"", () => {
    expect(sha512Hex("abc")).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    );
  });
});
