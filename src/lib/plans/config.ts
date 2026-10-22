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
  // K-Connect VIDEO minutes included per calendar month, for the whole church (every meeting, live class and
  // live stream room counts, not one call) — null means unlimited. K-Audio gets its own pool of 10 more
  // (see kaudioMaxDurationMinutes). When a call starts, the minutes still left are snapshotted onto the
  // meeting row as its limit (see kmeet/minutes-service.ts), so a mid-call plan change never changes an
  // already-running call's countdown. The field keeps its old name because custom plan overrides saved in
  // the database use it.
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
  // How many chat groups (People > Groups) a church can have at once; archived groups do not count. null = unlimited.
  groupLimit: number | null;
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
  rest: Omit<
    PlanLimits,
    | "id"
    | "name"
    | "priceInRupees"
    | "priceLabel"
    | "priceInRupeesAnnual"
    | "priceLabelAnnual"
  >,
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
      emailsPerMonth: 1000,
      // Far smaller than the email quota — SMS costs real money per message
      // sent through the shared Twilio account, unlike email's Resend free
      // tier headroom.
      smsPerMonth: 50,
      // Same shared-Twilio cost reasoning as SMS — only counts 'shared'-mode
      // WhatsApp sends; an org's own connected number is unmetered.
      whatsappPerMonth: 2500,
      aiRepliesPerMonth: 100,
      instagramAccountLimit: 1,
      youtubeAccountLimit: 1,
      storageBytes: 20 * 1024 * 1024 * 1024, // 20GB
      // K-Audio auto-derives to 30 min via kaudioMaxDurationMinutes()
      // below (always kmeet + 10).
      kmeetMaxDurationMinutes: 20,
      maxAdditionalAdmins: 1,
      maxAdditionalStaff: 2,
      branchLimit: 3,
      memberLimit: 350,
      formsLimit: 20,
      groupLimit: 3,
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
      whatsappPerMonth: 7500,
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
      groupLimit: 7,
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
      emailsPerMonth: 10000,
      smsPerMonth: 1000,
      whatsappPerMonth: 10000,
      aiRepliesPerMonth: 1000,
      instagramAccountLimit: 5,
      youtubeAccountLimit: 5,
      storageBytes: 150 * 1024 * 1024 * 1024, // 150GB
      kmeetMaxDurationMinutes: 60,
      maxAdditionalAdmins: 10,
      maxAdditionalStaff: 20,
      branchLimit: 20,
      memberLimit: 10000,
      formsLimit: null,
      groupLimit: 15,
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

// K-Audio's limit is always K-Meet's limit + 10 minutes (unlimited stays
// unlimited) — a relative rule, not an independent number, so it can
// never drift out of sync if K-Meet's own limits ever change.
export function kaudioMaxDurationMinutes(plan: PlanLimits): number | null {
  return plan.kmeetMaxDurationMinutes === null
    ? null
    : plan.kmeetMaxDurationMinutes + 10;
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
export const FINANCE_TABS: TabKey[] = [
  "fundraisers",
  "offerings",
  "donations",
  "accounting",
];
export const SOCIAL_TABS: TabKey[] = ["instagram", "youtube", "facebook"];

export interface TenantFeatureSettings {
  // Missing key = plan default. true forces on, false forces off.
  tabOverrides?: Partial<Record<TabKey, boolean>>;
  // Missing or null = unlimited.
  featureCaps?: Partial<Record<CappableTab, number | null>>;
  // How many features the church can offer in its mobile app. Missing = 15, the most the app allows.
  mobileFeatureLimit?: number;
}

// The rule fields a platform admin can set for a negotiated deal, plus
// per-tenant feature switches and caps. Pricing and identity stay with the
// underlying plan.
export type CustomPlanOverrides = Omit<
  PlanLimits,
  | "id"
  | "name"
  | "priceInRupees"
  | "priceLabel"
  | "priceInRupeesAnnual"
  | "priceLabelAnnual"
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
export function effectiveTabs(
  base: PlanLimits,
  tabOverrides: TenantFeatureSettings["tabOverrides"],
): Record<TabKey, boolean> {
  const result = {} as Record<TabKey, boolean>;
  for (const tab of TAB_KEYS) {
    result[tab] = tabOverrides?.[tab] ?? planTabDefault(base, tab);
  }
  return result;
}

export function resolveTabStates(
  planId: PlanId,
  customOverrides: CustomPlanOverrides | null,
): Record<TabKey, boolean> {
  return effectiveTabs(PLANS[planId], customOverrides?.tabOverrides);
}

// The single place "what limits does this org actually have" is
// computed. Module flags and automation limit are derived from the tab
// switches, so a tab turned on or off for one tenant also changes the
// page-level checks that read those flags.
export function resolvePlanLimits(
  planId: PlanId,
  customOverrides: CustomPlanOverrides | null,
): PlanLimits {
  const basePlan = PLANS[planId];
  if (!customOverrides) return basePlan;

  const rules: Partial<CustomPlanOverrides> = { ...customOverrides };
  delete rules.tabOverrides;
  delete rules.featureCaps;
  delete rules.mobileFeatureLimit;
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

export function featureCapFor(
  customOverrides: CustomPlanOverrides | null,
  tab: CappableTab,
): number | null {
  return customOverrides?.featureCaps?.[tab] ?? null;
}

export function isPlanId(value: string): value is PlanId {
  return value === "basic" || value === "premium" || value === "pro";
}

export function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

export function priceForInterval(
  plan: PlanLimits,
  interval: BillingInterval,
): { amount: number; label: string } {
  return interval === "monthly"
    ? { amount: plan.priceInRupees, label: plan.priceLabel }
    : { amount: plan.priceInRupeesAnnual, label: plan.priceLabelAnnual };
}

// One-time top-ups on top of a plan's monthly quota/storage ceiling —
// bought individually, not tied to a billing cycle. "credits" is a message
// count for sms/email/whatsapp, or a byte count for storage.
export type AddonType =
  "sms" | "email" | "whatsapp" | "storage" | "ai" | "kconnect";

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
  kconnect: "K-Connect minutes",
};

// What one more block of anything costs, in rupees a month before GST. One table, used for the add-on packs below and
// for pricing a custom package (src/lib/onboarding/config.ts), so the two always agree. "step" is the size of one block
// and the smallest change: counts go up by this much at a time.
export const EXTRA_PRICING = {
  storageGb: { step: 20, price: 50 },
  email: { step: 1000, price: 50 },
  sms: { step: 20, price: 30 },
  whatsapp: { step: 500, price: 50 },
  ai: { step: 100, price: 50 },
  members: { step: 100, price: 30 },
  branches: { step: 1, price: 10 },
  forms: { step: 10, price: 20 },
  groups: { step: 1, price: 20 },
  admins: { step: 1, price: 20 },
  staff: { step: 1, price: 5 },
  socialAccount: { step: 1, price: 50 },
} as const;

// Add-on packs: one block at the rate above, and five blocks at the same rate per block.
function blocks(
  id: string,
  addonType: AddonType,
  label: (amount: string) => string,
  rate: { step: number; price: number },
  times: number,
  creditsPer: number = rate.step,
  format: (n: number) => string = (n) => n.toLocaleString("en-IN"),
): AddonPack {
  return {
    id: `${id}_${rate.step * times}`,
    addonType,
    label: label(format(rate.step * times)),
    credits: creditsPer * times,
    priceInRupees: rate.price * times,
  };
}

const GB = 1024 * 1024 * 1024;

export const ADDON_PACKS: AddonPack[] = [
  ...[1, 5].map((n) =>
    blocks("sms", "sms", (a) => `${a} SMS credits`, EXTRA_PRICING.sms, n),
  ),
  ...[1, 5].map((n) =>
    blocks(
      "email",
      "email",
      (a) => `${a} email credits`,
      EXTRA_PRICING.email,
      n,
    ),
  ),
  ...[1, 5].map((n) =>
    blocks(
      "whatsapp",
      "whatsapp",
      (a) => `${a} WhatsApp credits`,
      EXTRA_PRICING.whatsapp,
      n,
    ),
  ),
  ...[1, 5].map((n) => ({
    ...blocks(
      "storage",
      "storage",
      (a) => `+${a} GB storage`,
      EXTRA_PRICING.storageGb,
      n,
      EXTRA_PRICING.storageGb.step * GB,
    ),
    id: `storage_${EXTRA_PRICING.storageGb.step * n}gb`,
  })),
  ...[1, 5].map((n) =>
    blocks("ai", "ai", (a) => `${a} AI credits`, EXTRA_PRICING.ai, n),
  ),
  // Minutes, for video or audio, valid in the month they are bought.
  {
    id: "kconnect_30",
    addonType: "kconnect",
    label: "30 K-Connect minutes",
    credits: 30,
    priceInRupees: 100,
  },
];

export function getAddonPack(packId: string): AddonPack | undefined {
  return ADDON_PACKS.find((pack) => pack.id === packId);
}

export function addonPacksFor(addonType: AddonType): AddonPack[] {
  return ADDON_PACKS.filter((pack) => pack.addonType === addonType);
}
