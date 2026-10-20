// Fills an event's registration form from a member's own details, for the
// one-tap registration in the mobile app. Pure, so the rules are testable.

export interface RegistrationFieldLite {
  key: string;
  label?: string;
  field_type: string;
  required?: boolean;
}

export interface QuickMember {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export function buildQuickAnswers(
  fields: RegistrationFieldLite[],
  member: QuickMember,
): { answers: Record<string, string> } | { error: string } {
  const answers: Record<string, string> = {};
  const fullName = `${member.first_name} ${member.last_name ?? ""}`.trim();

  for (const field of fields) {
    if (field.field_type === "email") {
      if (member.email) answers[field.key] = member.email;
    } else if (field.field_type === "phone") {
      if (member.phone) answers[field.key] = member.phone;
    } else if (field.key === "name") {
      answers[field.key] = fullName;
    } else if (field.required) {
      // Something the member's profile can't answer.
      return {
        error:
          "This event needs more details. Please register on the event page.",
      };
    }
  }

  const emailField = fields.find((f) => f.field_type === "email");
  if (!emailField || !answers[emailField.key])
    return {
      error: "Add your email address to your details first, then register.",
    };
  const phoneField = fields.find((f) => f.field_type === "phone");
  if (phoneField?.required && !answers[phoneField.key])
    return {
      error: "Add your phone number to your details first, then register.",
    };

  return { answers };
}
