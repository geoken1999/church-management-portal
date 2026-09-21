import "server-only";

// Unlike Instagram/YouTube/Facebook, there's no per-org OAuth connection
// here — Resend is a single app-wide provider, so this is just a couple of
// env vars rather than a "connect your account" flow.
export function getEmailEnv() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;

  if (!apiKey || !fromAddress) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM_ADDRESS must be set to send email.");
  }

  return { apiKey, fromAddress };
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM_ADDRESS);
}
