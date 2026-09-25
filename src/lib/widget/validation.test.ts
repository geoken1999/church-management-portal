import { describe, it, expect } from "vitest";
import { validateWidgetSettings, sanitizeWidgetPosition, sanitizeWidgetFields, DEFAULT_WIDGET_FIELDS } from "./validation";

describe("validateWidgetSettings", () => {
  const valid = { primaryColor: "#7c3aed", buttonLabel: "Chat with us", greetingTitle: "Get in touch" };

  it("accepts valid settings", () => {
    expect(validateWidgetSettings(valid)).toEqual({});
  });

  it("rejects a non-hex color", () => {
    expect(validateWidgetSettings({ ...valid, primaryColor: "purple" }).primaryColor).toBeDefined();
  });

  it("rejects an empty button label", () => {
    expect(validateWidgetSettings({ ...valid, buttonLabel: "  " }).buttonLabel).toBeDefined();
  });

  it("rejects an empty greeting title", () => {
    expect(validateWidgetSettings({ ...valid, greetingTitle: "" }).greetingTitle).toBeDefined();
  });
});

describe("sanitizeWidgetPosition", () => {
  it("passes through bottom-left", () => {
    expect(sanitizeWidgetPosition("bottom-left")).toBe("bottom-left");
  });

  it("defaults anything else to bottom-right", () => {
    expect(sanitizeWidgetPosition("top-center")).toBe("bottom-right");
    expect(sanitizeWidgetPosition(undefined)).toBe("bottom-right");
  });
});

describe("sanitizeWidgetFields", () => {
  it("filters out malformed entries", () => {
    const result = sanitizeWidgetFields([{ key: "name", label: "Name", field_type: "text", required: true }, { bogus: true }, null]);
    expect(result).toEqual([{ key: "name", label: "Name", field_type: "text", options: null, required: true }]);
  });

  it("returns an empty array for non-array input", () => {
    expect(sanitizeWidgetFields(null)).toEqual([]);
  });
});

describe("DEFAULT_WIDGET_FIELDS", () => {
  it("has unique keys", () => {
    const keys = DEFAULT_WIDGET_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
