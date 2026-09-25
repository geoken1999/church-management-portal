// Phone normalization/country resolution is identical to SMS's needs
// (E.164, resolved via the recipient's branch/org country) — re-exported
// rather than duplicated so the two stay in lockstep.
import { normalizePhoneNumber } from "@/lib/sms/validation";

export { normalizePhoneNumber, resolvePhoneCountry } from "@/lib/sms/validation";

export function validateWhatsAppBody(body: string): string | undefined {
  if (!body.trim()) return "Write a message before sending.";
  return undefined;
}

export function validateWhatsAppAccountSid(value: string): string | undefined {
  if (!value.trim()) return "Enter your Twilio Account SID.";
  return undefined;
}

export function validateWhatsAppAuthToken(value: string): string | undefined {
  if (!value.trim()) return "Enter your Twilio Auth Token.";
  return undefined;
}

export function validateWhatsAppNumber(value: string): string | undefined {
  if (!value.trim()) return "Enter your WhatsApp-enabled Twilio number.";
  if (!normalizePhoneNumber(value)) return "Enter a valid phone number, e.g. +14155552671.";
  return undefined;
}
