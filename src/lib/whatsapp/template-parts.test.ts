import { describe, expect, it } from "vitest";
import { metaButtonsComponent, parseTemplateButtons, validateHeaderImage, validateTemplateButtons } from "@/lib/whatsapp/template-parts";

describe("validateHeaderImage", () => {
  it("accepts a JPEG or PNG within 5 MB", () => {
    expect(validateHeaderImage("image/jpeg", 1000)).toBeUndefined();
    expect(validateHeaderImage("image/png", 5 * 1024 * 1024)).toBeUndefined();
  });

  it("rejects other types, empty files and files over 5 MB", () => {
    expect(validateHeaderImage("image/gif", 1000)).toBeDefined();
    expect(validateHeaderImage("image/jpeg", 0)).toBeDefined();
    expect(validateHeaderImage("image/jpeg", 5 * 1024 * 1024 + 1)).toBeDefined();
  });
});

describe("validateTemplateButtons", () => {
  it("accepts up to three valid buttons", () => {
    expect(
      validateTemplateButtons([
        { type: "url", text: "Give online", url: "https://kingdomflow.in/give" },
        { type: "phone", text: "Call us", phone: "+919876543210" },
        { type: "quick_reply", text: "I'm coming" },
      ]),
    ).toBeUndefined();
  });

  it("rejects a fourth button", () => {
    const four = Array.from({ length: 4 }, () => ({ type: "quick_reply" as const, text: "Yes" }));
    expect(validateTemplateButtons(four)).toBeDefined();
  });

  it("rejects text over 25 characters, an empty label, a non-https link and a bad phone number", () => {
    expect(validateTemplateButtons([{ type: "quick_reply", text: "x".repeat(26) }])).toBeDefined();
    expect(validateTemplateButtons([{ type: "quick_reply", text: "  " }])).toBeDefined();
    expect(validateTemplateButtons([{ type: "url", text: "Give", url: "http://example.com" }])).toBeDefined();
    expect(validateTemplateButtons([{ type: "phone", text: "Call", phone: "98765" }])).toBeDefined();
  });
});

describe("parseTemplateButtons", () => {
  it("reads a well-formed list", () => {
    expect(parseTemplateButtons([{ type: "quick_reply", text: "Yes" }])).toEqual([{ type: "quick_reply", text: "Yes" }]);
  });

  it("refuses an unknown type or a non-list", () => {
    expect(parseTemplateButtons([{ type: "dance", text: "x" }])).toBeNull();
    expect(parseTemplateButtons("nope")).toBeNull();
  });
});

describe("metaButtonsComponent", () => {
  it("uses Meta's component names", () => {
    expect(
      metaButtonsComponent([
        { type: "url", text: "Give", url: "https://example.org/give" },
        { type: "phone", text: "Call", phone: "+919876543210" },
        { type: "quick_reply", text: "Yes" },
      ]),
    ).toEqual({
      type: "BUTTONS",
      buttons: [
        { type: "URL", text: "Give", url: "https://example.org/give" },
        { type: "PHONE_NUMBER", text: "Call", phone_number: "+919876543210" },
        { type: "QUICK_REPLY", text: "Yes" },
      ],
    });
    expect(metaButtonsComponent([])).toBeNull();
  });
});
