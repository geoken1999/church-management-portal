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
