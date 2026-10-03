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
  return validateWhatsAppTemplatePlaceholders(value);
}

// Meta rejects a template with INVALID_FORMAT if its {{...}} placeholders
// aren't plain sequential numbers starting at {{1}} — named placeholders
// like {{name}} (an easy mistake to make, since that's the natural way to
// write one) and gaps like {{1}}, {{3}} (skipping {{2}}) both fail this
// way. Catching it here means a doomed submission never reaches Meta at
// all, instead of coming back as an opaque "INVALID_FORMAT" rejection
// with no actionable detail.
function asPlaceholder(value: string | number): string {
  return "{{" + value + "}}";
}

export function validateWhatsAppTemplatePlaceholders(bodyText: string): string | undefined {
  const matches = [...bodyText.matchAll(/\{\{\s*([^}]*)\s*\}\}/g)];
  if (matches.length === 0) return undefined;

  const named = matches.find((m) => !/^\d+$/.test(m[1].trim()));
  if (named) {
    const shown = named[1].trim() || "...";
    return `WhatsApp templates use numbered placeholders like ${asPlaceholder(1)}, ${asPlaceholder(2)}, not named ones like ${asPlaceholder(shown)}. Use ${asPlaceholder(1)} for the first variable, ${asPlaceholder(2)} for the second, and so on.`;
  }

  const numbers = [...new Set(matches.map((m) => Number(m[1].trim())))].sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== i + 1) {
      const found = numbers.map(asPlaceholder).join(", ");
      return `Placeholders must be sequential starting at ${asPlaceholder(1)} with no gaps — found ${found}. Renumber them so they run ${asPlaceholder(1)}, ${asPlaceholder(2)}, ... in order.`;
    }
  }
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
