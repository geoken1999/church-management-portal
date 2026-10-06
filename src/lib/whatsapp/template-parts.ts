// Rules for a WhatsApp template's optional image header and buttons. Pure, so
// the form and the server check the same things, and Meta's shape is built in
// one place.

import type { WhatsAppTemplateButton } from "@/types/database";

export const MAX_TEMPLATE_BUTTONS = 3;
export const BUTTON_TEXT_MAX = 25;
export const HEADER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const HEADER_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export const HEADER_IMAGE_BUCKET = "whatsapp-template-headers";

export function validateHeaderImage(mime: string, bytes: number): string | undefined {
  if (!(HEADER_IMAGE_TYPES as readonly string[]).includes(mime)) return "The header image must be a JPEG or PNG.";
  if (bytes <= 0) return "Choose a header image.";
  if (bytes > HEADER_IMAGE_MAX_BYTES) return "The header image must be 5 MB or smaller.";
  return undefined;
}

export function validateTemplateButton(button: WhatsAppTemplateButton): string | undefined {
  const text = button.text.trim();
  if (!text) return "Every button needs text.";
  if (text.length > BUTTON_TEXT_MAX) return `Button text can be ${BUTTON_TEXT_MAX} characters at most.`;
  if (button.type === "url") {
    if (!/^https:\/\/\S+$/.test(button.url.trim())) return "A link button needs an https:// address.";
  }
  if (button.type === "phone") {
    if (!/^\+\d{8,15}$/.test(button.phone.trim())) return "A call button needs a phone number with the country code, like +919876543210.";
  }
  return undefined;
}

export function validateTemplateButtons(buttons: WhatsAppTemplateButton[]): string | undefined {
  if (buttons.length > MAX_TEMPLATE_BUTTONS) return `A template can have up to ${MAX_TEMPLATE_BUTTONS} buttons.`;
  for (const button of buttons) {
    const problem = validateTemplateButton(button);
    if (problem) return problem;
  }
  return undefined;
}

// Reads the buttons the form sent. Returns null if the list isn't usable, so
// a tampered request can't store something Meta would reject.
export function parseTemplateButtons(raw: unknown): WhatsAppTemplateButton[] | null {
  if (!Array.isArray(raw)) return null;
  const buttons: WhatsAppTemplateButton[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const entry = item as Record<string, unknown>;
    const text = typeof entry.text === "string" ? entry.text : "";
    if (entry.type === "url" && typeof entry.url === "string") buttons.push({ type: "url", text, url: entry.url });
    else if (entry.type === "phone" && typeof entry.phone === "string") buttons.push({ type: "phone", text, phone: entry.phone });
    else if (entry.type === "quick_reply") buttons.push({ type: "quick_reply", text });
    else return null;
  }
  return buttons;
}

// Meta's component shapes. The header goes first, then the body (built by the
// caller), then the buttons.
export function metaHeaderComponent(handle: string): Record<string, unknown> {
  return { type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } };
}

export function metaButtonsComponent(buttons: WhatsAppTemplateButton[]): Record<string, unknown> | null {
  if (buttons.length === 0) return null;
  return {
    type: "BUTTONS",
    buttons: buttons.map((b) => {
      if (b.type === "url") return { type: "URL", text: b.text.trim(), url: b.url.trim() };
      if (b.type === "phone") return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: b.phone.trim() };
      return { type: "QUICK_REPLY", text: b.text.trim() };
    }),
  };
}
