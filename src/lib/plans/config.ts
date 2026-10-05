// No "server-only" guard — plain constants, safe to import from Client
// Components too (e.g. the landing page pricing table, the Billing page's
// checkout UI). The DB-aware lookup (which plan an org is actually on)
// lives in plans/dal.ts instead, since that needs a Supabase call.

export type PlanId = "basic" | "premium" | "pro";
export type BillingInterval = "monthly" | "annual";

export const ANNUAL_DISCOUNT = 0.17;

export interface PlanLimits {
  id: PlanId;
  name: string;
  // The source of truth for billing — Razorpay amounts are in paise, so
  // every Razorpay call multiplies this by 100 rather than hand-entering
  // paise amounts. The label fields are derived from these, not
  // independently set. Annual is monthly × 12, discounted by
  // ANNUAL_DISCOUNT — not an independently chosen price, so the two
  // intervals can never drift out of the advertised "17% off" ratio,
  // except where a tier passes an explicit annualRupeesOverride (see
  // tier() below) to hit an exact advertised price the rounded formula
  // doesn't quite land on.
  priceInRupees: number;
  priceLabel: string;
  priceInRupeesAnnual: number;
  priceLabelAnnual: string;
  emailsPerMonth: number;
  smsPerMonth: number;
  whatsappPerMonth: number;
  // Each automatic AI-generated Instagram DM reply costs 1 credit.
  aiRepliesPerMonth: number;
  // How many separate Instagram/YouTube accounts an org can have connected
  // at once (each counted independently — an org on Pro can have 5
  // Instagram accounts AND 5 YouTube channels, not 5 total).
  instagramAccountLimit: number;
  youtubeAccountLimit: number;
  storageBytes: number;
  // How long a single K-meet call can run before it's automatically ended
  // for everyone — null means unlimited. Snapshotted onto the meeting row
  // the moment its call actually starts (see kmeet/actions.ts), not
  // re-read live, so a mid-call plan change never changes an
  // already-running call's countdown.
  kmeetMaxDurationMinutes: number | null;
  // How many logins an owner/admin can add beyond themselves (invited
  // members, and now manually-issued logins), split by role — the org
  // creator's own seat doesn't count against either. Checked
  // independently (see checkTeamMemberQuota in plans/dal.ts): an org
  // can't cover an exhausted admin seat by adding more staff instead.
  maxAdditionalAdmins: number;
  maxAdditionalStaff: number;
  // null means unlimited. Branches/members count every row the org has
  // today regardless of when it was created; forms counts every form
  // regardless of status (draft/published).
  branchLimit: number | null;
  memberLimit: number | null;
  formsLimit: number | null;
  // Whole-module gates, independent of the tab permissions matrix — that
  // matrix decides who *within* an org can use a tab; this decides whether
  // the org has the tab at all, and applies even to the owner.
  financeEnabled: boolean;
  // Narrower than financeEnabled: whether an org can connect its OWN
  // Razorpay account for Fundraisers (saveOwnRazorpayAccount). An org can
  // have financeEnabled=true (Fundraisers/Donations/Offerings exist) but
  // ownPaymentGatewayEnabled=false (can only use the platform's shared
  // gateway, never its own account) — that's exactly Starter's rule.
  ownPaymentGatewayEnabled: boolean;
  socialMediaEnabled: boolean;
  customSmtpEnabled: boolean;
  // How many automations an org can have set up at once — 0 means the
  // module is off entirely (Starter), null means unlimited. Checked by
  // checkAutomationQuota (plans/dal.ts) before a new one is created.
  automationLimit: number | null;
  // Not enforced against a clock anywhere — purely the number shown on
  // the pricing page and Billing/Profile's plan summary.
  supportSlaDays: number;
}

function annualRupeesFor(monthlyRupees: number): number {
  return Math.round(monthlyRupees * 12 * (1 - ANNUAL_DISCOUNT));
}

function rupeeLabel(rupees: number, interval: BillingInterval): string {
  return `₹${rupees.toLocaleString("en-IN")}/${interval === "monthly" ? "month" : "year"}`;
}

function tier(
  id: PlanId,
  name: string,
  monthlyRupees: number,
  rest: Omit<PlanLimits, "id" | "name" | "priceInRupees" | "priceLabel" | "priceInRupeesAnnual" | "priceLabelAnnual">,
  annualRupeesOverride?: number,
): PlanLimits {
  const annualRupees = annualRupeesOverride ?? annualRupeesFor(monthlyRupees);
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
  // Internal id stays "basic" (the DB column, Razorpay env var keys, and
  // the cancellation/floor-plan fallback logic across billing all use
  // this literal) — only the display name, price, and limits changed
  // when this tier became "Starter".
  basic: tier(
    "basic",
    "Starter",
    1499,
    {
      emailsPerMonth: 500,
      // Far smaller than the email quota — SMS costs real money per message
      // sent through the shared Twilio account, unlike email's Resend free
      // tier headroom.
      smsPerMonth: 50,
      // Same shared-Twilio cost reasoning as SMS — only counts 'shared'-mode
      // WhatsApp sends; an org's own connected number is unmetered.
      whatsappPerMonth: 50,
      aiRepliesPerMonth: 100,
      instagramAccountLimit: 1,
      youtubeAccountLimit: 1,
      storageBytes: 10 * 1024 * 1024 * 1024, // 10GB
      // K-Audio auto-derives to 30 min via kaudioMaxDurationMinutes()
      // below (always kmeet + 10).
      kmeetMaxDurationMinutes: 20,
      maxAdditionalAdmins: 1,
      maxAdditionalStaff: 2,
      branchLimit: 3,
      memberLimit: 350,
      formsLimit: 20,
      financeEnabled: true,
      ownPaymentGatewayEnabled: false,
      socialMediaEnabled: true,
      customSmtpEnabled: false,
      automationLimit: 0,
      supportSlaDays: 5,
    },
    // Explicit override: the 17%-off formula rounds to ₹14,990, one
    // rupee short of the advertised ₹14,999 — a contractual price, not
    // advisory rounding, so it's hardcoded here rather than derived.
    14999,
  ),
  // Internal id stays "premium" — only the display name/price/limits
  // changed when this tier became "Growth".
  premium: tier(
    "premium",
    "Growth",
    2999,
    {
      emailsPerMonth: 5000,
      smsPerMonth: 500,
      whatsappPerMonth: 500,
      aiRepliesPerMonth: 500,
      instagramAccountLimit: 3,
      youtubeAccountLimit: 3,
      storageBytes: 50 * 1024 * 1024 * 1024, // 50GB
      // K-Audio auto-derives to 50 min via kaudioMaxDurationMinutes().
      kmeetMaxDurationMinutes: 40,
      maxAdditionalAdmins: 3,
      maxAdditionalStaff: 5,
      branchLimit: 10,
      memberLimit: 2000,
      formsLimit: 100,
      financeEnabled: true,
      ownPaymentGatewayEnabled: true,
      socialMediaEnabled: true,
      customSmtpEnabled: true,
      automationLimit: 5,
      supportSlaDays: 3,
    },
    // Explicit override: the 17%-off formula rounds to ₹29,870, short of
    // the advertised ₹29,999.
    29999,
  ),
  // Internal id stays "pro" — only the display name/price/limits changed.
  pro: tier(
    "pro",
    "Pro",
    4999,
    {
      emailsPerMonth: 15000,
      smsPerMonth: 1000,
      whatsappPerMonth: 1000,
      aiRepliesPerMonth: 1000,
      instagramAccountLimit: 5,
      youtubeAccountLimit: 5,
      storageBytes: 150 * 1024 * 1024 * 1024, // 150GB
      kmeetMaxDurationMinutes: null,
      maxAdditionalAdmins: 10,
      maxAdditionalStaff: 20,
      branchLimit: 20,
      memberLimit: 10000,
      formsLimit: null,
      financeEnabled: true,
      ownPaymentGatewayEnabled: true,
      socialMediaEnabled: true,
      customSmtpEnabled: true,
      automationLimit: 10,
      supportSlaDays: 1,
    },
    // Explicit override: the 17%-off formula rounds to ₹49,790, short of
    // the advertised ₹49,999.
    49999,
  ),
};

// K-Audio's limit is always K-meet's limit + 10 minutes (unlimited stays
// unlimited) — a relative rule, not an independent number, so it can
// never drift out of sync if K-meet's own limits ever change.
export function kaudioMaxDurationMinutes(plan: PlanLimits): number | null {
  return plan.kmeetMaxDurationMinutes === null ? null : plan.kmeetMaxDurationMinutes + 10;
}

// A platform admin's per-org override for a negotiated "Custom" deal
// (see the landing page's Custom tier, which is otherwise entirely
// manual — no PlanId, no price). Covers every rule PLANS tiers set,
// deliberately excluding identity/pricing fields: a Custom org's price
// stays whatever was comped manually (via setTenantPlan), only the
// *rules* vary here. Stored as-is in organizations.custom_plan_limits.
import { TAB_KEYS, type TabKey } from "@/lib/permissions/tabs";

// Tabs whose per-tenant cap counts rows in their own table. Other tabs get
// on/off only; the four plan-level quotas (branches, members, forms,
// automations) keep their existing fields instead.
export const CAPPABLE_TABS = [
  "events",
  "todos",
  "fundraisers",
  "ministries",
  "families",
  "leaders",
  "youth",
  "committee",
] as const;
export type CappableTab = (typeof CAPPABLE_TABS)[number];

// Module-level switches. Each group is one switch in the Custom rules
// dialog, so every tab in a group always resolves the same way.
export const FINANCE_TABS: TabKey[] = ["fundraisers", "offerings", "donations", "accounting"];
export const SOCIAL_TABS: TabKey[] = ["instagram", "youtube", "facebook"];

export interface TenantFeatureSettings {
  // Missing key = plan default. true forces on, false forces off.
  tabOverrides?: Partial<Record<TabKey, boolean>>;
  // Missing or null = unlimited.
  featureCaps?: Partial<Record<CappableTab, number | null>>;
}

// The rule fields a platform admin can set for a negotiated deal, plus
// per-tenant feature switches and caps. Pricing and identity stay with the
// underlying plan.
export type CustomPlanOverrides = Omit<
  PlanLimits,
  "id" | "name" | "priceInRupees" | "priceLabel" | "priceInRupeesAnnual" | "priceLabelAnnual"
> &
  TenantFeatureSettings;

// What the plan includes by default for one tab, before any tenant override.
function planTabDefault(base: PlanLimits, tab: TabKey): boolean {
  if (FINANCE_TABS.includes(tab)) return base.financeEnabled;
  if (SOCIAL_TABS.includes(tab)) return base.socialMediaEnabled;
  if (tab === "automations") return base.automationLimit !== 0;
  return true;
}

// Every tab's effective on/off state for an org: the plan default, with
// any tenant override applied on top.
export function effectiveTabs(base: PlanLimits, tabOverrides: TenantFeatureSettings["tabOverrides"]): Record<TabKey, boolean> {
  const result = {} as Record<TabKey, boolean>;
  for (const tab of TAB_KEYS) {
    result[tab] = tabOverrides?.[tab] ?? planTabDefault(base, tab);
  }
  return result;
}

export function resolveTabStates(planId: PlanId, customOverrides: CustomPlanOverrides | null): Record<TabKey, boolean> {
  return effectiveTabs(PLANS[planId], customOverrides?.tabOverrides);
}

// The single place "what limits does this org actually have" is
// computed. Module flags and automation limit are derived from the tab
// switches, so a tab turned on or off for one tenant also changes the
// page-level checks that read those flags.
export function resolvePlanLimits(planId: PlanId, customOverrides: CustomPlanOverrides | null): PlanLimits {
  const basePlan = PLANS[planId];
  if (!customOverrides) return basePlan;

  const rules: Partial<CustomPlanOverrides> = { ...customOverrides };
  delete rules.tabOverrides;
  delete rules.featureCaps;
  const tabs = effectiveTabs(basePlan, customOverrides.tabOverrides);

  let automationLimit = rules.automationLimit ?? basePlan.automationLimit;
  if (!tabs.automations) automationLimit = 0;
  else if (automationLimit === 0) automationLimit = null;

  return {
    ...basePlan,
    ...rules,
    financeEnabled: tabs.fundraisers,
    socialMediaEnabled: tabs.instagram,
    automationLimit,
    name: "Custom",
  };
}

export function featureCapFor(customOverrides: CustomPlanOverrides | null, tab: CappableTab): number | null {
  return customOverrides?.featureCaps?.[tab] ?? null;
}

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
export type AddonType = "sms" | "email" | "whatsapp" | "storage" | "ai";

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
  ai: "AI Credits",
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
  { id: "ai_100", addonType: "ai", label: "100 AI credits", credits: 100, priceInRupees: 299 },
  { id: "ai_500", addonType: "ai", label: "500 AI credits", credits: 500, priceInRupees: 1199 },
];

export function getAddonPack(packId: string): AddonPack | undefined {
  return ADDON_PACKS.find((pack) => pack.id === packId);
}

export function addonPacksFor(addonType: AddonType): AddonPack[] {
  return ADDON_PACKS.filter((pack) => pack.addonType === addonType);
}
