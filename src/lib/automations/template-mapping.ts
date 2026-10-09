// Meta requires any proactive WhatsApp send to use a pre-approved template
// with positional {{1}}, {{2}}, ... placeholders. This automation's editor
// uses friendlier named placeholders instead ({{first_name}}), so these
// functions convert between the two: extractVariableNames()/toPositionalBody()
// run once, at template-submission time, to build what gets sent to Meta;
// resolveBodyParams() runs at every actual send, turning that same name
// order back into the positional array sendTemplateMessage() expects.

const NAMED_VARIABLE_PATTERN = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g;

// First-occurrence order, deduplicated — a name used twice in the body
// collapses to one position (Meta has no notion of repeating a single
// positional slot twice in one body anyway).
export function extractVariableNames(bodyTextNamed: string): string[] {
  const seen: string[] = [];
  for (const match of bodyTextNamed.matchAll(NAMED_VARIABLE_PATTERN)) {
    const name = match[1];
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

export function toPositionalBody(bodyTextNamed: string, variableNames: string[]): string {
  return bodyTextNamed.replace(NAMED_VARIABLE_PATTERN, (_match, name: string) => {
    const index = variableNames.indexOf(name);
    return index === -1 ? _match : `{{${index + 1}}}`;
  });
}

// values keyed by variable name; missing values resolve to "" rather than
// throwing, since a template's declared variable list is the source of
// truth for what sendTemplateMessage's bodyParams must contain.
export function resolveBodyParams(variableNames: string[], values: Record<string, string>): string[] {
  return variableNames.map((name) => values[name] ?? "");
}

// What a member_direct placeholder can be filled with. "field:<key>" picks
// one of these per-member/per-org values; "text:<literal>" is fixed text.
export const MEMBER_VARIABLE_FIELDS = [
  { key: "first_name", label: "Member's first name" },
  { key: "last_name", label: "Member's last name" },
  { key: "full_name", label: "Member's full name" },
  { key: "church_name", label: "Church name" },
  { key: "occasion_label", label: "Occasion label (e.g. Birthday)" },
] as const;

export const MAX_VARIABLE_TEXT_LENGTH = 200;

export type VariableValues = Record<string, string>;

export function validateVariableValues(values: VariableValues): string | undefined {
  for (const [name, source] of Object.entries(values)) {
    if (source.startsWith("field:")) {
      if (!MEMBER_VARIABLE_FIELDS.some((f) => f.key === source.slice(6))) return `Unknown value chosen for {{${name}}}.`;
    } else if (source.startsWith("text:")) {
      const text = source.slice(5).trim();
      if (!text) return `Enter the text to use for {{${name}}}.`;
      if (text.length > MAX_VARIABLE_TEXT_LENGTH) return `The text for {{${name}}} is too long.`;
    } else {
      return `Unknown value chosen for {{${name}}}.`;
    }
  }
  return undefined;
}

// builtIns are the available field values; overrides are the trigger's
// saved choices. A variable with no override uses the built-in of the same
// name, which is what every trigger did before choices existed.
export function resolveVariableValues(variableNames: string[], builtIns: Record<string, string>, overrides: VariableValues | null | undefined): Record<string, string> {
  const resolved: Record<string, string> = { ...builtIns };
  for (const name of variableNames) {
    const source = overrides?.[name];
    if (!source) continue;
    if (source.startsWith("field:")) resolved[name] = builtIns[source.slice(6)] ?? "";
    else if (source.startsWith("text:")) resolved[name] = source.slice(5).trim();
  }
  return resolved;
}
