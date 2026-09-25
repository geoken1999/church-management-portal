// No "server-only" guard — plain constants, safe to import from Client
// Components too (e.g. the landing page pricing table, the Billing page's
// checkout UI). The DB-aware lookup (which plan an org is actually on)
// lives in plans/dal.ts instead, since that needs a Supabase call.

export type PlanId = "basic" | "premium" | "pro";
export type BillingInterval = "monthly" | "annual";

export const ANNUAL_DISCOUNT = 0.1;

export interface PlanLimits {
  id: PlanId;
  name: string;
  // The source of truth for billing — Razorpay amounts are in paise, so
  // every Razorpay call multiplies this by 100 rather than hand-entering
  // paise amounts. The label fields are derived from these, not
  // independently set. Annual is monthly × 12, discounted by
  // ANNUAL_DISCOUNT — not an independently chosen price, so the two
  // intervals can never drift out of the advertised "10% off" ratio.
  priceInRupees: number;
  priceLabel: string;
  priceInRupeesAnnual: number;
  priceLabelAnnual: string;
  emailsPerMonth: number;
  smsPerMonth: number;
  whatsappPerMonth: number;
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

function annualRupeesFor(monthlyRupees: number): number {
  return Math.round(monthlyRupees * 12 * (1 - ANNUAL_DISCOUNT));
}

function rupeeLabel(rupees: number, interval: BillingInterval): string {
  return `₹${rupees.toLocaleString("en-IN")}/${interval === "monthly" ? "month" : "year"}`;
}

function tier(id: PlanId, name: string, monthlyRupees: number, rest: Omit<PlanLimits, "id" | "name" | "priceInRupees" | "priceLabel" | "priceInRupeesAnnual" | "priceLabelAnnual">): PlanLimits {
  const annualRupees = annualRupeesFor(monthlyRupees);
  return {
    id,
    name,
    priceInRupees: monthlyRupees,
    priceLabel: rupeeLabel(monthlyRupees, "monthly"),
    priceInRupeesAnnual: annualRupees,
    priceLabelAnnual: rupeeLabel(annualRupees, "annual"),
    ...rest,
  };
}

export const PLANS: Record<PlanId, PlanLimits> = {
  basic: tier("basic", "Basic", 499, {
    emailsPerMonth: 500,
    // Far smaller than the email quota — SMS costs real money per message
    // sent through the shared Twilio account, unlike email's Resend free
    // tier headroom.
    smsPerMonth: 50,
    // Same shared-Twilio cost reasoning as SMS — only counts 'shared'-mode
    // WhatsApp sends; an org's own connected number is unmetered.
    whatsappPerMonth: 50,
    storageBytes: 1 * 1024 * 1024 * 1024, // 1GB
    maxAdditionalTeamMembers: 3,
    financeEnabled: false,
    socialMediaEnabled: false,
    customSmtpEnabled: false,
  }),
  premium: tier("premium", "Premium", 2499, {
    emailsPerMonth: 3000,
    smsPerMonth: 300,
    whatsappPerMonth: 300,
    storageBytes: 10 * 1024 * 1024 * 1024, // 10GB
    maxAdditionalTeamMembers: 10,
    financeEnabled: true,
    socialMediaEnabled: false,
    customSmtpEnabled: true,
  }),
  pro: tier("pro", "Pro", 6999, {
    emailsPerMonth: 10000,
    smsPerMonth: 1000,
    whatsappPerMonth: 1000,
    storageBytes: 50 * 1024 * 1024 * 1024, // 50GB
    maxAdditionalTeamMembers: 50,
    financeEnabled: true,
    socialMediaEnabled: true,
    customSmtpEnabled: true,
  }),
};

export function isPlanId(value: string): value is PlanId {
  return value === "basic" || value === "premium" || value === "pro";
}

export function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

export function priceForInterval(plan: PlanLimits, interval: BillingInterval): { amount: number; label: string } {
  return interval === "monthly"
    ? { amount: plan.priceInRupees, label: plan.priceLabel }
    : { amount: plan.priceInRupeesAnnual, label: plan.priceLabelAnnual };
}
