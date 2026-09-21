import "server-only";

// Shared-only, like email's Resend path — no per-org "bring your own
// Twilio" (unlike email, which also supports per-org SMTP). One Twilio
// account sends for every org, metered by plan quota.
export function getSmsEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !(messagingServiceSid || fromNumber)) {
    throw new Error(
      "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER must be set to send SMS.",
    );
  }

  return { accountSid, authToken, messagingServiceSid, fromNumber };
}

export function isSmsConfigured(): boolean {
  const hasSender = Boolean(process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER);
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && hasSender);
}
