import { describe, it, expect } from "vitest";
import { extractVariableNames, toPositionalBody, resolveBodyParams, resolveVariableValues, validateVariableValues } from "./template-mapping";

describe("extractVariableNames", () => {
  it("returns names in first-occurrence order", () => {
    expect(extractVariableNames("Hi {{first_name}}, from {{church_name}}!")).toEqual(["first_name", "church_name"]);
  });

  it("deduplicates a name used more than once", () => {
    expect(extractVariableNames("{{first_name}}, {{first_name}}!")).toEqual(["first_name"]);
  });

  it("returns an empty array when there are no variables", () => {
    expect(extractVariableNames("Happy birthday!")).toEqual([]);
  });
});

describe("toPositionalBody", () => {
  it("replaces named placeholders with their 1-based position", () => {
    const body = "Hi {{first_name}}, from {{church_name}}!";
    const names = extractVariableNames(body);
    expect(toPositionalBody(body, names)).toBe("Hi {{1}}, from {{2}}!");
  });

  it("leaves a body with no variables unchanged", () => {
    expect(toPositionalBody("Happy birthday!", [])).toBe("Happy birthday!");
  });
});

describe("resolveBodyParams", () => {
  it("round-trips named values into positional order", () => {
    const body = "Hi {{first_name}}, from {{church_name}}!";
    const names = extractVariableNames(body);
    const params = resolveBodyParams(names, { first_name: "Priya", church_name: "Grace Chapel" });
    expect(params).toEqual(["Priya", "Grace Chapel"]);
  });

  it("resolves a missing value to an empty string rather than throwing", () => {
    expect(resolveBodyParams(["first_name"], {})).toEqual([""]);
  });
});

describe("resolveVariableValues", () => {
  const builtIns = { first_name: "Ann", last_name: "Lee", full_name: "Ann Lee", church_name: "Grace", occasion_label: "Birthday" };

  it("falls back to the built-in of the same name when no choice was saved", () => {
    expect(resolveVariableValues(["first_name"], builtIns, {})).toMatchObject({ first_name: "Ann" });
  });

  it("maps a placeholder to a chosen field or fixed text", () => {
    const out = resolveVariableValues(["name", "greeting"], builtIns, { name: "field:full_name", greeting: "text: God bless " });
    expect(out.name).toBe("Ann Lee");
    expect(out.greeting).toBe("God bless");
  });
});

describe("validateVariableValues", () => {
  it("rejects unknown fields and empty text", () => {
    expect(validateVariableValues({ a: "field:nope" })).toBeDefined();
    expect(validateVariableValues({ a: "text:  " })).toBeDefined();
    expect(validateVariableValues({ a: "field:first_name", b: "text:Hi" })).toBeUndefined();
  });
});
