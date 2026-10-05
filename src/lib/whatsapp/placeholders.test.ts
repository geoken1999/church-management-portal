import { describe, expect, it } from "vitest";
import { parsePlaceholderSpecs, placeholderLabel, resolvePlaceholder, validatePlaceholderSpec } from "@/lib/whatsapp/placeholders";

const member = { firstName: "Asha", fullName: "Asha Kumar", branchName: "Chennai" };

describe("resolvePlaceholder", () => {
  it("sends the same typed value to everyone", () => {
    expect(resolvePlaceholder({ kind: "fixed", value: "Hi everyone" }, member)).toBe("Hi everyone");
    expect(resolvePlaceholder({ kind: "fixed", value: "Hi everyone" }, null)).toBe("Hi everyone");
  });

  it("uses each member's own first name, full name and branch", () => {
    expect(resolvePlaceholder({ kind: "member", field: "first_name", fallback: "Friend" }, member)).toBe("Asha");
    expect(resolvePlaceholder({ kind: "member", field: "full_name", fallback: "Friend" }, member)).toBe("Asha Kumar");
    expect(resolvePlaceholder({ kind: "member", field: "branch", fallback: "Friend" }, member)).toBe("Chennai");
  });

  it("uses the fallback for a number that isn't a member", () => {
    expect(resolvePlaceholder({ kind: "member", field: "first_name", fallback: "Friend" }, null)).toBe("Friend");
  });

  it("uses the fallback when the member has no value for that field", () => {
    expect(resolvePlaceholder({ kind: "member", field: "branch", fallback: "Friend" }, { ...member, branchName: null })).toBe("Friend");
  });
});

describe("parsePlaceholderSpecs", () => {
  it("accepts a valid list for the right number of placeholders", () => {
    expect(
      parsePlaceholderSpecs(
        [
          { kind: "member", field: "first_name", fallback: "Friend" },
          { kind: "fixed", value: "Sunday at 10" },
        ],
        2,
      ),
    ).toHaveLength(2);
  });

  it("rejects a list with the wrong count, an unknown field or a malformed entry", () => {
    expect(parsePlaceholderSpecs([{ kind: "fixed", value: "x" }], 2)).toBeNull();
    expect(parsePlaceholderSpecs([{ kind: "member", field: "email", fallback: "x" }], 1)).toBeNull();
    expect(parsePlaceholderSpecs([null], 1)).toBeNull();
    expect(parsePlaceholderSpecs("nope", 1)).toBeNull();
  });
});

describe("validatePlaceholderSpec", () => {
  it("needs a typed value, or a fallback for a member field", () => {
    expect(validatePlaceholderSpec({ kind: "fixed", value: "  " })).toBeDefined();
    expect(validatePlaceholderSpec({ kind: "member", field: "first_name", fallback: "" })).toBeDefined();
    expect(validatePlaceholderSpec({ kind: "member", field: "first_name", fallback: "Friend" })).toBeUndefined();
  });
});

describe("placeholderLabel", () => {
  it("records the typed value, or the field name, not one person's details", () => {
    expect(placeholderLabel({ kind: "fixed", value: "Hi" })).toBe("Hi");
    expect(placeholderLabel({ kind: "member", field: "first_name", fallback: "Friend" })).toBe("{first_name}");
  });
});
