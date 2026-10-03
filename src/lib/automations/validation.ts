import { extractVariableNames } from "@/lib/automations/template-mapping";

const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;

export function validateAutomationTemplateName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Enter a template name.";
  if (!TEMPLATE_NAME_PATTERN.test(trimmed)) return "Use only lowercase letters, numbers, and underscores (e.g. birthday_wishes).";
  return undefined;
}

export function validateAutomationTemplateBody(value: string): string | undefined {
  if (!value.trim()) return "Write the template's message text.";
  return undefined;
}

// A staff_digest template exists purely to carry one combined list of
// celebrants for the day, so it must declare exactly one variable,
// celebrant_list — enforced here (app code) rather than a SQL CHECK,
// matching how whatsapp/validation.ts owns this kind of rule.
export function validateAutomationTemplateKind(bodyTextNamed: string, kind: "member_direct" | "staff_digest"): string | undefined {
  if (kind !== "staff_digest") return undefined;
  const names = extractVariableNames(bodyTextNamed);
  if (names.length !== 1 || names[0] !== "celebrant_list") {
    return 'A staff digest template must use exactly one variable: {{celebrant_list}}.';
  }
  return undefined;
}
