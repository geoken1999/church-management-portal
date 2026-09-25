import type { FormField, WidgetPosition } from "@/types/database";
import { sanitizeFormFields } from "@/lib/forms/validation";

export { FORM_FIELD_TYPES } from "@/lib/forms/validation";

export const WIDGET_POSITIONS: { value: WidgetPosition; label: string }[] = [
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
];

// A fresh widget's starting field set — the standard "capture a lead"
// shape most churches want, fully editable afterwards like a form's fields.
export const DEFAULT_WIDGET_FIELDS: FormField[] = [
  { key: "name", label: "Name", field_type: "text", options: null, required: true },
  { key: "email", label: "Email", field_type: "email", options: null, required: true },
  { key: "phone", label: "Phone", field_type: "phone", options: null, required: false },
  { key: "message", label: "Message", field_type: "textarea", options: null, required: true },
];

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface WidgetSettingsErrors {
  primaryColor?: string;
  buttonLabel?: string;
  greetingTitle?: string;
}

export function validateWidgetSettings(input: {
  primaryColor: string;
  buttonLabel: string;
  greetingTitle: string;
}): WidgetSettingsErrors {
  const errors: WidgetSettingsErrors = {};

  if (!HEX_COLOR_PATTERN.test(input.primaryColor.trim())) {
    errors.primaryColor = "Enter a valid hex color, e.g. #7c3aed.";
  }

  if (!input.buttonLabel.trim()) {
    errors.buttonLabel = "Button label is required.";
  } else if (input.buttonLabel.trim().length > 40) {
    errors.buttonLabel = "Button label must be under 40 characters.";
  }

  if (!input.greetingTitle.trim()) {
    errors.greetingTitle = "Greeting title is required.";
  } else if (input.greetingTitle.trim().length > 60) {
    errors.greetingTitle = "Greeting title must be under 60 characters.";
  }

  return errors;
}

export function sanitizeWidgetPosition(raw: unknown): WidgetPosition {
  return raw === "bottom-left" ? "bottom-left" : "bottom-right";
}

// Reuses the exact Forms field schema/boundary check — a widget's field
// set has the same shape (key/label/field_type/options/required), so
// there's no reason to duplicate the sanitizer.
export function sanitizeWidgetFields(raw: unknown): FormField[] {
  return sanitizeFormFields(raw);
}
