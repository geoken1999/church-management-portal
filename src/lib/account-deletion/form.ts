// Pure helpers for the public account-deletion form.

export const RELATIONSHIPS = [
  { value: "member", label: "I'm a church member" },
  { value: "team", label: "I'm on a church's team (staff or volunteer login)" },
  { value: "owner", label: "I'm a church owner" },
  {
    value: "guest",
    label: "I filled in a church's form or registered for an event",
  },
  { value: "other", label: "Something else" },
] as const;

export const SCOPES = [
  {
    value: "account_and_data",
    label: "Delete my account and the records the church holds about me",
  },
  { value: "account", label: "Delete only my sign-in account" },
] as const;

export type Relationship = (typeof RELATIONSHIPS)[number]["value"];
export type Scope = (typeof SCOPES)[number]["value"];

export interface DeletionFormInput {
  name: string;
  email: string;
  phone: string;
  churchName: string;
  relationship: string;
  scope: string;
  details: string;
}

export type DeletionFormErrors = Partial<
  Record<keyof DeletionFormInput, string>
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDeletionForm(
  input: DeletionFormInput,
): DeletionFormErrors {
  const errors: DeletionFormErrors = {};
  if (input.name.trim().length < 2) errors.name = "Enter your full name.";
  else if (input.name.trim().length > 100)
    errors.name = "Keep your name under 100 characters.";
  if (!input.email.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL_RE.test(input.email.trim()) || input.email.length > 200)
    errors.email = "Enter a valid email address.";
  if (input.phone.trim() && !/^[0-9+\-\s()]{7,20}$/.test(input.phone.trim()))
    errors.phone = "Enter a valid phone number, or leave it blank.";
  if (input.churchName.trim().length > 150)
    errors.churchName = "Keep the church name under 150 characters.";
  if (!RELATIONSHIPS.some((r) => r.value === input.relationship))
    errors.relationship = "Choose how you're connected to KingdomFlow.";
  if (!SCOPES.some((s) => s.value === input.scope))
    errors.scope = "Choose what you want deleted.";
  if (input.details.length > 1000)
    errors.details = "Keep the details under 1000 characters.";
  return errors;
}

export const TOKEN_HOURS = 72;
