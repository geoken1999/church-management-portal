import type { FormField, FormFieldType } from "@/types/database";

export const FORM_FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
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

export interface FormFieldErrors {
  label?: string;
  options?: string;
}

export function validateFormField(input: { label: string; fieldType: string; options: string[] }): FormFieldErrors {
  const errors: FormFieldErrors = {};

  if (!input.label.trim()) {
    errors.label = "Field label is required.";
  } else if (input.label.trim().length > 80) {
    errors.label = "Field label must be under 80 characters.";
  }

  if (input.fieldType === "select" && input.options.length === 0) {
    errors.options = "Add at least one option, one per line.";
  }

  return errors;
}

export interface FormMetaErrors {
  title?: string;
}

export function validateFormMeta(input: { title: string }): FormMetaErrors {
  const errors: FormMetaErrors = {};

  if (!input.title.trim()) {
    errors.title = "Title is required.";
  } else if (input.title.trim().length < 2) {
    errors.title = "Title must be at least 2 characters.";
  }

  return errors;
}

// Ensures a well-formed FormField[] regardless of what the client sent —
// the builder UI should never produce anything else, but this is the
// server's own boundary check before it's persisted as the live schema
// that submit_form_response validates every public submission against.
export function sanitizeFormFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];

  const seenKeys = new Set<string>();
  const fields: FormField[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { key, label, field_type, options, required } = entry as Record<string, unknown>;
    if (typeof key !== "string" || typeof label !== "string" || typeof field_type !== "string") continue;
    if (!FORM_FIELD_TYPES.some((t) => t.value === field_type)) continue;

    let uniqueKey = key;
    let attempt = 1;
    while (seenKeys.has(uniqueKey)) {
      attempt += 1;
      uniqueKey = `${key}_${attempt}`;
    }
    seenKeys.add(uniqueKey);

    fields.push({
      key: uniqueKey,
      label: label.trim(),
      field_type: field_type as FormFieldType,
      options: field_type === "select" && Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : null,
      required: Boolean(required),
    });
  }

  return fields;
}
