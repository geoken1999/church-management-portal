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

// PayU's server-to-server "postservice" APIs (Verify Payment, and the
// Recurring Payment Transaction API used for subscription charges) are
// documented as living on a DIFFERENT host than the checkout endpoint in
// live mode — secure.payu.in for checkout, but info.payu.in for these
// postservice calls. In test mode both are test.payu.in, so PAYU_BASE_URL
// already works as-is there. NOT verified against a live call (this app
// has no Standing Instructions/Subscriptions approval yet to test
// against) — confirm this against PayU's own docs/support before relying
// on it in live mode.
export function getPayUPostServiceBaseUrl(): string {
  return isPayULive() ? "https://info.payu.in" : getPayUEnv().baseUrl;
}
