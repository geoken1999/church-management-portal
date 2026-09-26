import type { EventRegistrationField, EventReminderOffset, FormFieldType } from "@/types/database";
import { FORM_FIELD_TYPES } from "@/lib/forms/validation";

export { FORM_FIELD_TYPES } from "@/lib/forms/validation";

export const EVENT_REMINDER_OFFSETS: EventReminderOffset[] = ["24h", "1h", "morning_of"];
export const EVENT_REMINDER_OFFSET_LABELS: Record<EventReminderOffset, string> = {
  "24h": "24 hours before",
  "1h": "1 hour before",
  morning_of: "Morning of (8 AM)",
};

// A fresh registration form's starting fields — Name, Email, and Phone,
// the minimum needed to actually run a registration, email a pass, and
// keep one person from registering twice (email and phone are each
// enforced unique per event in submit_event_registration, migration
// 0069). These three are permanently required — the field editor won't
// let an organizer remove them (see PROTECTED_FIELD_KEYS) — since
// registration, the pass email, and duplicate-prevention all depend on
// them existing.
export const DEFAULT_REGISTRATION_FIELDS: EventRegistrationField[] = [
  { key: "name", label: "Name", field_type: "text", options: null, required: true },
  { key: "email", label: "Email", field_type: "email", options: null, required: true },
  { key: "phone", label: "Phone", field_type: "phone", options: null, required: true },
];

// Matches DEFAULT_REGISTRATION_FIELDS' own keys — a field editor row for
// one of these hides its remove button and locks "Required" on. Renaming
// one far enough to change its derived key (see slugifyFieldKey) isn't
// separately blocked here, but validateRegistrationSettings below
// re-checks these same keys at save time regardless, so that path still
// gets caught — just with a "can't be removed" message rather than a
// rename-specific one.
export const PROTECTED_FIELD_KEYS = ["name", "email", "phone"];

// Email and Phone are identified elsewhere (submit_event_registration,
// migration 0067/0070) by field_type, not by key — so unlike "name",
// their type has to stay locked too, or an organizer could quietly break
// pass-emailing/dedupe by retyping "Phone" to "Short text" while its key
// stays "phone" and validateRegistrationSettings' key-presence check
// keeps passing.
const TYPE_LOCKED_FIELDS: Partial<Record<string, FormFieldType>> = {
  email: "email",
  phone: "phone",
};

export function isProtectedField(field: { key: string }): boolean {
  return PROTECTED_FIELD_KEYS.includes(field.key);
}

export function isTypeLockedField(field: { key: string }): boolean {
  return field.key in TYPE_LOCKED_FIELDS;
}

// Defense-in-depth alongside the field editor's disabled checkbox/select
// for protected fields — re-applied server-side right before saving, in
// case a request ever reaches here with those locks not actually
// respected (a stale client, a direct API call, etc.).
export function enforceProtectedFieldRules(fields: EventRegistrationField[]): EventRegistrationField[] {
  return fields.map((field) => {
    if (!isProtectedField(field)) return field;
    const lockedType = TYPE_LOCKED_FIELDS[field.key];
    return { ...field, required: true, field_type: lockedType ?? field.field_type };
  });
}

// Same boundary-check shape as Forms' sanitizeFormFields (a form's field
// set is only ever as trustworthy as what the client sent), plus
// preserving the `unique` flag Forms/Widget's fields don't have.
export function sanitizeRegistrationFields(raw: unknown): EventRegistrationField[] {
  if (!Array.isArray(raw)) return [];

  const seenKeys = new Set<string>();
  const fields: EventRegistrationField[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { key, label, field_type, options, required, unique } = entry as Record<string, unknown>;
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
      unique: Boolean(unique),
    });
  }

  return enforceProtectedFieldRules(fields);
}

export function hasEmailField(fields: EventRegistrationField[]): boolean {
  return fields.some((field) => field.field_type === "email");
}

function hasPhoneField(fields: EventRegistrationField[]): boolean {
  return fields.some((field) => field.key === "phone" && field.field_type === "phone");
}

export const MAX_PASS_BACKGROUND_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PASS_BACKGROUND_TYPES = ["image/png", "image/jpeg", "image/webp"];

// The pass banner is displayed at 480x140 in the email (registration-pass.ts)
// — this is exactly 2.5x that, for a crisp image on high-DPI screens. A hard
// exact-match requirement (rather than just checking the aspect ratio)
// keeps every organizer's pass looking identically sharp rather than
// silently letting a mismatched image get stretched or blurrily upscaled.
export const PASS_BACKGROUND_WIDTH = 1200;
export const PASS_BACKGROUND_HEIGHT = 350;

export interface RegistrationSettingsErrors {
  fields?: string;
  capacity?: string;
  closesAt?: string;
  passColor?: string;
  reminderOffset?: string;
}

export function validateRegistrationSettings(input: {
  fields: EventRegistrationField[];
  capacity: string;
  closesAt: string;
  passColor?: string;
  reminderOffset?: string;
}): RegistrationSettingsErrors {
  const errors: RegistrationSettingsErrors = {};

  if (input.reminderOffset && !EVENT_REMINDER_OFFSETS.includes(input.reminderOffset as EventReminderOffset)) {
    errors.reminderOffset = "Choose a valid reminder timing.";
  }

  const keys = new Set(input.fields.map((f) => f.key));
  const missing: string[] = [];
  if (!keys.has("name")) missing.push("Name");
  if (!hasEmailField(input.fields)) missing.push("Email");
  if (!hasPhoneField(input.fields)) missing.push("Phone");
  if (missing.length > 0) {
    errors.fields = `The ${missing.join(", ")} field${missing.length > 1 ? "s" : ""} can't be removed or changed — registration, the emailed pass, and duplicate checking all depend on ${missing.length > 1 ? "them" : "it"}.`;
  }

  if (input.capacity.trim()) {
    const capacity = Number(input.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) {
      errors.capacity = "Capacity must be a whole number greater than 0, or left blank for unlimited.";
    }
  }

  if (input.closesAt.trim() && Number.isNaN(new Date(input.closesAt).getTime())) {
    errors.closesAt = "That date isn't valid.";
  }

  if (input.passColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(input.passColor.trim())) {
    errors.passColor = "Enter a valid hex color, e.g. #7c3aed.";
  }

  return errors;
}
