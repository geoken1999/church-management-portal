import "server-only";

// The shared-mode WhatsApp sender — same Twilio account already used for
// SMS (TWILIO_ACCOUNT_SID/AUTH_TOKEN), but WhatsApp needs its own
// WhatsApp-enabled sender number, hence the separate env var rather than
// reusing TWILIO_FROM_NUMBER (an SMS-only number can't send WhatsApp).
export function getWhatsAppEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM_NUMBER must be set to send WhatsApp messages.");
  }

  return { accountSid, authToken, fromNumber };
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM_NUMBER);
}
