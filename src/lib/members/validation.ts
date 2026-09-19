import type { MemberFieldDefinition, MemberFieldType, CustomFieldValue } from "@/types/database";

export const FIELD_TYPE_OPTIONS: { value: MemberFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Yes / No" },
  { value: "select", label: "Dropdown" },
];

export function slugifyFieldKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function parseOptionsText(optionsText: string): string[] {
  return optionsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface FieldDefinitionErrors {
  label?: string;
  options?: string;
}

export function validateFieldDefinition(input: {
  label: string;
  fieldType: string;
  options: string[];
}): FieldDefinitionErrors {
  const errors: FieldDefinitionErrors = {};

  if (!input.label.trim()) {
    errors.label = "Field label is required.";
  } else if (input.label.trim().length > 60) {
    errors.label = "Field label must be under 60 characters.";
  }

  if (input.fieldType === "select" && input.options.length === 0) {
    errors.options = "Add at least one option, one per line.";
  }

  return errors;
}

export interface MemberFieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  custom?: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-().]{7,20}$/;

export function validateMemberBasics(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Pick<MemberFieldErrors, "firstName" | "lastName" | "email" | "phone"> {
  const errors: Pick<MemberFieldErrors, "firstName" | "lastName" | "email" | "phone"> = {};

  if (!input.firstName.trim()) errors.firstName = "First name is required.";
  if (!input.lastName.trim()) errors.lastName = "Last name is required.";
  if (input.email.trim() && !EMAIL_RE.test(input.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (input.phone.trim() && !PHONE_RE.test(input.phone.trim())) {
    errors.phone = "Enter a valid phone number.";
  }

  return errors;
}

// Validates and coerces raw form values against the org's custom field
// definitions, so a required text field can't be skipped and a number field
// can't be handed non-numeric input.
export function parseCustomFieldValues(
  definitions: MemberFieldDefinition[],
  getRaw: (key: string) => string,
): { values: Record<string, CustomFieldValue>; errors: Record<string, string> } {
  const values: Record<string, CustomFieldValue> = {};
  const errors: Record<string, string> = {};

  for (const def of definitions) {
    const raw = getRaw(def.key).trim();

    if (def.field_type === "checkbox") {
      values[def.key] = raw === "on" || raw === "true";
      continue;
    }

    if (!raw) {
      if (def.required) errors[def.key] = `${def.label} is required.`;
      values[def.key] = null;
      continue;
    }

    if (def.field_type === "number") {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) {
        errors[def.key] = `${def.label} must be a number.`;
        values[def.key] = null;
      } else {
        values[def.key] = parsed;
      }
      continue;
    }

    if (def.field_type === "select" && def.options && !def.options.includes(raw)) {
      errors[def.key] = `Select a valid option for ${def.label}.`;
      values[def.key] = null;
      continue;
    }

    values[def.key] = raw;
  }

  return { values, errors };
}
