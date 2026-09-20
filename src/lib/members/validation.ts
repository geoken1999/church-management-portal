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
  dateOfBirth?: string;
  maritalStatus?: string;
  weddingDate?: string;
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

export const MARITAL_STATUSES = ["married", "unmarried"] as const;

// Date of birth and marital status are default (not org-customizable)
// member fields — mandatory on both the admin form and the public join
// form. Wedding date is only required (and only meaningful) when married.
// Comparing as "YYYY-MM-DD" strings sorts chronologically correctly, so no
// Date parsing/timezone handling is needed here.
export function validateMemberDetails(input: {
  dateOfBirth: string;
  maritalStatus: string;
  weddingDate: string;
}): Pick<MemberFieldErrors, "dateOfBirth" | "maritalStatus" | "weddingDate"> {
  const errors: Pick<MemberFieldErrors, "dateOfBirth" | "maritalStatus" | "weddingDate"> = {};
  const today = new Date().toISOString().slice(0, 10);

  if (!input.dateOfBirth) {
    errors.dateOfBirth = "Date of birth is required.";
  } else if (input.dateOfBirth > today) {
    errors.dateOfBirth = "Date of birth can't be in the future.";
  }

  if (!MARITAL_STATUSES.includes(input.maritalStatus as (typeof MARITAL_STATUSES)[number])) {
    errors.maritalStatus = "Select a marital status.";
  }

  if (input.maritalStatus === "married") {
    if (!input.weddingDate) {
      errors.weddingDate = "Wedding date is required.";
    } else if (input.weddingDate > today) {
      errors.weddingDate = "Wedding date can't be in the future.";
    } else if (input.dateOfBirth && input.weddingDate < input.dateOfBirth) {
      errors.weddingDate = "Wedding date can't be before the date of birth.";
    }
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
