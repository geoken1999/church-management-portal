import { describe, it, expect } from "vitest";
import { isStartMessage, isStopMessage, renderNamedTemplate, renderTemplateText } from "./template-render";

describe("renderTemplateText", () => {
  it("fills the numbered placeholders", () => {
    expect(renderTemplateText("Hi {{1}}, join {{2}} on {{3}}.", ["Ann", "Camp", "Sat"])).toBe("Hi Ann, join Camp on Sat.");
  });
  it("leaves a missing value blank rather than printing the placeholder", () => {
    expect(renderTemplateText("Hi {{1}} and {{2}}", ["Ann"])).toBe("Hi Ann and");
  });
});

describe("opt-out words", () => {
  it("recognises STOP in any case and with punctuation, but not a normal sentence", () => {
    expect(isStopMessage("STOP")).toBe(true);
    expect(isStopMessage(" Unsubscribe. ")).toBe(true);
    expect(isStopMessage("please stop by on sunday")).toBe(false);
    expect(isStopMessage(null)).toBe(false);
  });
  it("recognises START", () => {
    expect(isStartMessage("Start")).toBe(true);
    expect(isStartMessage("starting soon")).toBe(false);
  });
});

describe("renderNamedTemplate", () => {
  it("fills named placeholders", () => {
    expect(renderNamedTemplate("Happy birthday {{first_name}} from {{church_name}}", { first_name: "Ann", church_name: "Grace" })).toBe("Happy birthday Ann from Grace");
  });
});
