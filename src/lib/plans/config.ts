// No "server-only" guard — plain constants, safe to import from Client
// Components too (e.g. the landing page pricing table, the Billing page's
// checkout UI). The DB-aware lookup (which plan an org is actually on)
// lives in plans/dal.ts instead, since that needs a Supabase call.

export type PlanId = "basic" | "premium" | "pro";

export interface PlanLimits {
  id: PlanId;
  name: string;
  // The source of truth for billing — Razorpay amounts are in paise, so
  // every Razorpay call multiplies this by 100 rather than hand-entering
  // paise amounts. priceLabel is derived from it, not independently set.
  priceInRupees: number;
  priceLabel: string;
  emailsPerMonth: number;
  smsPerMonth: number;
  storageBytes: number;
  // How many logins an owner/admin can add beyond themselves (invited
  // members, and now manually-issued logins) — the org creator's own seat
  // doesn't count against this.
  maxAdditionalTeamMembers: number;
  // Whole-module gates, independent of the tab permissions matrix — that
  // matrix decides who *within* an org can use a tab; this decides whether
  // the org has the tab at all, and applies even to the owner.
  financeEnabled: boolean;
  socialMediaEnabled: boolean;
  customSmtpEnabled: boolean;
}

function rupeeLabel(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN")}/month`;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  basic: {
    id: "basic",
    name: "Basic",
    priceInRupees: 499,
    priceLabel: rupeeLabel(499),
    emailsPerMonth: 500,
    // Far smaller than the email quota — SMS costs real money per message
    // sent through the shared Twilio account, unlike email's Resend free
    // tier headroom.
    smsPerMonth: 50,
    storageBytes: 1 * 1024 * 1024 * 1024, // 1GB
    maxAdditionalTeamMembers: 3,
    financeEnabled: false,
    socialMediaEnabled: false,
    customSmtpEnabled: false,
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceInRupees: 2499,
    priceLabel: rupeeLabel(2499),
    emailsPerMonth: 3000,
    smsPerMonth: 300,
    storageBytes: 10 * 1024 * 1024 * 1024, // 10GB
    maxAdditionalTeamMembers: 10,
    financeEnabled: true,
    socialMediaEnabled: false,
    customSmtpEnabled: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceInRupees: 6999,
    priceLabel: rupeeLabel(6999),
    emailsPerMonth: 10000,
    smsPerMonth: 1000,
    storageBytes: 50 * 1024 * 1024 * 1024, // 50GB
    maxAdditionalTeamMembers: 50,
    financeEnabled: true,
    socialMediaEnabled: true,
    customSmtpEnabled: true,
  },
};

export function isPlanId(value: string): value is PlanId {
  return value === "basic" || value === "premium" || value === "pro";
}
