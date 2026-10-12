// The link and button on a push an admin sends. Pure, so the rules are testable.

export interface PushActionInput {
  linkUrl: string;
  buttonLabel: string;
}

export function validatePushAction(input: PushActionInput): { error: string } | { linkUrl: string | null; buttonLabel: string | null } {
  const linkUrl = input.linkUrl.trim();
  const buttonLabel = input.buttonLabel.trim();

  if (!linkUrl) {
    if (buttonLabel) return { error: "A button needs a link to open." };
    return { linkUrl: null, buttonLabel: null };
  }
  if (linkUrl.length > 500) return { error: "That link is too long." };
  let parsed: URL;
  try {
    parsed = new URL(linkUrl);
  } catch {
    return { error: "Enter a full link starting with https://." };
  }
  if (parsed.protocol !== "https:") return { error: "The link must start with https://." };
  if (buttonLabel.length > 24) return { error: "Button text can be at most 24 characters." };
  return { linkUrl: parsed.toString(), buttonLabel: buttonLabel || null };
}
