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

// One-time top-ups on top of a plan's monthly quota/storage ceiling —
// bought individually, not tied to a billing cycle. "credits" is a message
// count for sms/email/whatsapp, or a byte count for storage.
export type AddonType = "sms" | "email" | "whatsapp" | "storage";

export interface AddonPack {
  id: string;
  addonType: AddonType;
  label: string;
  credits: number;
  priceInRupees: number;
}

export const ADDON_TYPE_LABELS: Record<AddonType, string> = {
  sms: "SMS",
  email: "Email",
  whatsapp: "WhatsApp",
  storage: "Storage",
};

export const ADDON_PACKS: AddonPack[] = [
  { id: "sms_500", addonType: "sms", label: "500 SMS credits", credits: 500, priceInRupees: 399 },
  { id: "sms_2000", addonType: "sms", label: "2,000 SMS credits", credits: 2000, priceInRupees: 1399 },
  { id: "email_2000", addonType: "email", label: "2,000 email credits", credits: 2000, priceInRupees: 199 },
  { id: "email_10000", addonType: "email", label: "10,000 email credits", credits: 10000, priceInRupees: 799 },
  { id: "whatsapp_500", addonType: "whatsapp", label: "500 WhatsApp credits", credits: 500, priceInRupees: 499 },
  { id: "whatsapp_2000", addonType: "whatsapp", label: "2,000 WhatsApp credits", credits: 2000, priceInRupees: 1699 },
  { id: "storage_5gb", addonType: "storage", label: "+5 GB storage", credits: 5 * 1024 * 1024 * 1024, priceInRupees: 249 },
  { id: "storage_25gb", addonType: "storage", label: "+25 GB storage", credits: 25 * 1024 * 1024 * 1024, priceInRupees: 999 },
];

export function getAddonPack(packId: string): AddonPack | undefined {
  return ADDON_PACKS.find((pack) => pack.id === packId);
}

export function addonPacksFor(addonType: AddonType): AddonPack[] {
  return ADDON_PACKS.filter((pack) => pack.addonType === addonType);
}
