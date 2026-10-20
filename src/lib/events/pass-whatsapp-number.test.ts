import { describe, it, expect } from "vitest";
import { pickWhatsAppNumber } from "./pass-whatsapp-number";

const field = (
  key: string,
  label: string,
  field_type: "phone" | "text" = "phone",
) => ({ key, label, field_type, options: null, required: true, unique: false });

describe("pickWhatsAppNumber", () => {
  const fields = [
    field("phone", "Phone"),
    field("whatsapp_number", "Whatsapp Number"),
    field("name", "Name", "text"),
  ];

  it("prefers the WhatsApp field over a plain phone field", () => {
    expect(
      pickWhatsAppNumber({ phone: "111", whatsapp_number: "222" }, fields),
    ).toBe("222");
  });

  it("falls back to another phone field, then the stored number", () => {
    expect(pickWhatsAppNumber({ phone: "111" }, fields)).toBe("111");
    expect(pickWhatsAppNumber({}, fields, "333")).toBe("333");
    expect(pickWhatsAppNumber({}, fields)).toBeNull();
  });

  it("ignores blank values", () => {
    expect(
      pickWhatsAppNumber({ whatsapp_number: "  ", phone: "111" }, fields),
    ).toBe("111");
  });
});
