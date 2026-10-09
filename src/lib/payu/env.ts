import "server-only";

export function getPayUEnv() {
  const merchantKey = process.env.PAYU_MERCHANT_KEY;
  const salt = process.env.PAYU_SALT;
  const baseUrl = process.env.PAYU_BASE_URL;

  if (!merchantKey || !salt || !baseUrl) {
    throw new Error("PAYU_MERCHANT_KEY, PAYU_SALT and PAYU_BASE_URL must be set to take payments.");
  }

  return { merchantKey, salt, baseUrl };
}

export function isPayUConfigured(): boolean {
  return Boolean(process.env.PAYU_MERCHANT_KEY && process.env.PAYU_SALT && process.env.PAYU_BASE_URL);
}

// true once PAYU_BASE_URL points at PayU's live endpoint rather than its
// sandbox (test.payu.in) — used to avoid ever showing a "test mode" notice
// against real money, and vice versa.
export function isPayULive(): boolean {
  const baseUrl = process.env.PAYU_BASE_URL ?? "";
  return /secure\.payu\.in/i.test(baseUrl);
}
