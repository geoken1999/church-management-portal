// Fills a template's {{1}}, {{2}}... with the values sent for one recipient,
// giving the plain text that person received. Used to resend a message by
// SMS or email when WhatsApp couldn't deliver it.
export function renderTemplateText(bodyText: string, params: string[]): string {
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index: string) => params[Number(index) - 1] ?? "").replace(/\s+\n/g, "\n").trim();
}

// The same for an automation template, whose text uses named placeholders
// ({{first_name}}) rather than numbered ones.
export function renderNamedTemplate(bodyNamed: string, values: Record<string, string>): string {
  return bodyNamed.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g, (_match, name: string) => values[name] ?? "").replace(/\s+\n/g, "\n").trim();
}

// Words a person can reply to opt out of WhatsApp messages.
const STOP_WORDS = new Set(["stop", "unsubscribe", "cancel", "optout", "opt out", "stop all", "end", "quit"]);

export function isStopMessage(text: string | undefined | null): boolean {
  return STOP_WORDS.has((text ?? "").trim().toLowerCase().replace(/[.!]+$/g, ""));
}

// "Start" brings them back.
export function isStartMessage(text: string | undefined | null): boolean {
  return ["start", "subscribe", "yes please", "unstop"].includes((text ?? "").trim().toLowerCase().replace(/[.!]+$/g, ""));
}
