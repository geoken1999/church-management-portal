// Phone normalization/country resolution is identical to SMS's needs
// (E.164, resolved via the recipient's branch/org country) — re-exported
// rather than duplicated so the two stay in lockstep.
export { normalizePhoneNumber, resolvePhoneCountry } from "@/lib/sms/validation";

export function validateWhatsAppBody(body: string): string | undefined {
  if (!body.trim()) return "Write a message before sending.";
  return undefined;
}

const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;

export function validateWhatsAppTemplateName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Enter a template name.";
  if (!TEMPLATE_NAME_PATTERN.test(trimmed)) return "Use only lowercase letters, numbers, and underscores (e.g. sunday_reminder).";
  return undefined;
}

export function validateWhatsAppTemplateBody(value: string): string | undefined {
  if (!value.trim()) return "Write the template's message text.";
  return undefined;
}

// Counts the highest {{n}} placeholder used, so the UI knows how many
// example/fill-in values to collect — not just how many {{...}} tokens
// appear, in case the same number is reused.
export function countTemplateVariables(bodyText: string): number {
  const matches = [...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((m) => Number(m[1])));
}
