import { describe, expect, it } from "vitest";
import { buildQuickAnswers } from "@/lib/events/quick-register";

const fields = [
  { key: "name", field_type: "text", required: true },
  { key: "email", field_type: "email", required: true },
  { key: "phone", field_type: "phone", required: true },
];
const member = {
  first_name: "Asha",
  last_name: "Rao",
  email: "asha@x.com",
  phone: "9876543210",
};

describe("buildQuickAnswers", () => {
  it("fills name, email and phone from the member", () => {
    expect(buildQuickAnswers(fields, member)).toEqual({
      answers: { name: "Asha Rao", email: "asha@x.com", phone: "9876543210" },
    });
  });
  it("needs an email on the member's profile", () => {
    expect(
      buildQuickAnswers(fields, { ...member, email: null }),
    ).toHaveProperty("error");
  });
  it("needs a phone only when the form requires one", () => {
    expect(
      buildQuickAnswers(fields, { ...member, phone: null }),
    ).toHaveProperty("error");
    expect(
      buildQuickAnswers(
        fields.map((f) => (f.key === "phone" ? { ...f, required: false } : f)),
        { ...member, phone: null },
      ),
    ).toHaveProperty("answers");
  });
  it("sends the member to the event page when an extra field is required", () => {
    expect(
      buildQuickAnswers(
        [...fields, { key: "diet", field_type: "text", required: true }],
        member,
      ),
    ).toHaveProperty("error");
    expect(
      buildQuickAnswers(
        [...fields, { key: "diet", field_type: "text", required: false }],
        member,
      ),
    ).toHaveProperty("answers");
  });
});
