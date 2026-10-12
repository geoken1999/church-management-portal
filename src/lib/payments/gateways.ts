// The payment gateways a church can connect as its own. Pure, so the rules are
// testable.

export const GATEWAYS = ["razorpay", "payu", "cashfree"] as const;
export type Gateway = (typeof GATEWAYS)[number];

export const GATEWAY_LABELS: Record<Gateway, string> = {
  razorpay: "Razorpay",
  payu: "PayU",
  cashfree: "Cashfree",
};

export function isGateway(value: unknown): value is Gateway {
  return typeof value === "string" && (GATEWAYS as readonly string[]).includes(value);
}

// What the church is asked for, per gateway.
export const GATEWAY_FIELDS: Record<Gateway, { keyIdLabel: string; keySecretLabel: string; keyIdPlaceholder: string; help: string; hasEnvironment: boolean }> = {
  razorpay: {
    keyIdLabel: "Key ID",
    keySecretLabel: "Key Secret",
    keyIdPlaceholder: "rzp_live_xxxxxxxx",
    help: "Razorpay Dashboard → Settings → API Keys.",
    hasEnvironment: false,
  },
  payu: {
    keyIdLabel: "Merchant Key",
    keySecretLabel: "Salt",
    keyIdPlaceholder: "Your PayU merchant key",
    help: "PayU Dashboard → Payment Gateway → Merchant Key and Salt (use the Salt 1 / 32-bit salt).",
    hasEnvironment: true,
  },
  cashfree: {
    keyIdLabel: "App ID",
    keySecretLabel: "Secret Key",
    keyIdPlaceholder: "Your Cashfree App ID",
    help: "Cashfree Dashboard → Payment Gateway → Developers → API Keys.",
    hasEnvironment: true,
  },
};

export interface GatewayCredentialsInput {
  keyId: string;
  keySecret: string;
  environment: string;
}

export function validateGatewayCredentials(
  gateway: Gateway,
  input: GatewayCredentialsInput,
): { error: string } | { keyId: string; keySecret: string; environment: "live" | "test" } {
  const fields = GATEWAY_FIELDS[gateway];
  const keyId = input.keyId.trim();
  const keySecret = input.keySecret.trim();
  if (!keyId) return { error: `Enter your ${GATEWAY_LABELS[gateway]} ${fields.keyIdLabel}.` };
  if (!keySecret) return { error: `Enter your ${GATEWAY_LABELS[gateway]} ${fields.keySecretLabel}.` };
  if (keyId.length > 200 || keySecret.length > 400) return { error: "That looks too long to be a key." };
  const environment = fields.hasEnvironment && input.environment === "test" ? "test" : "live";
  return { keyId, keySecret, environment };
}

// PayU's hosted checkout host for a church's own account.
export function payuBaseUrl(environment: "live" | "test"): string {
  return environment === "test" ? "https://test.payu.in" : "https://secure.payu.in";
}

// Cashfree's Payment Gateway API host.
export function cashfreeApiBase(environment: "live" | "test"): string {
  return environment === "test" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
}
