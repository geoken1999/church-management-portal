import { describe, it, expect } from "vitest";
import { extractVariableNames, toPositionalBody, resolveBodyParams } from "./template-mapping";

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
