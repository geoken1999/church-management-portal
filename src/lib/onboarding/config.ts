// Pure constants and sums for tenant onboarding, safe to import from client components.
import { TAB_KEYS, TAB_LABELS, type TabKey } from "@/lib/permissions/tabs";
import {
  EXTRA_PRICING,
  FINANCE_TABS,
  PLANS,
  SOCIAL_TABS,
} from "@/lib/plans/config";
import { withGst } from "@/lib/billing/gst";

// UPI Autopay won't debit more than this in one go without extra authentication.
export const MANDATE_LIMIT_RUPEES = 15000;

export interface OnboardingModule {
  key: string;
  label: string;
  tabs: TabKey[];
}

// What a tenant can opt for. Finance and Social media are one switch each in the app (their tabs
// always resolve together), so they are one module each here too.
export const ONBOARDING_MODULES: OnboardingModule[] = (() => {
  const modules: OnboardingModule[] = [];
  for (const tab of TAB_KEYS) {
    if (FINANCE_TABS.includes(tab)) {
      if (tab === FINANCE_TABS[0])
        modules.push({
          key: "finance",
          label: "Finance (Fundraisers, Offerings, Donations, Accounting)",
          tabs: FINANCE_TABS,
        });
    } else if (SOCIAL_TABS.includes(tab)) {
      if (tab === SOCIAL_TABS[0])
        modules.push({
          key: "social",
          label: "Social media (Instagram, YouTube, Facebook)",
          tabs: SOCIAL_TABS,
        });
    } else {
      modules.push({ key: tab, label: TAB_LABELS[tab], tabs: [tab] });
    }
  }
  return modules;
})();

export const MODULE_KEYS = ONBOARDING_MODULES.map((m) => m.key);

export function isModuleKey(key: string): boolean {
  return MODULE_KEYS.includes(key);
}

// The on/off state of every tab for a set of chosen modules.
export function tabStatesFor(moduleKeys: string[]): Record<TabKey, boolean> {
  const on = new Set<TabKey>();
  for (const entry of ONBOARDING_MODULES)
    if (moduleKeys.includes(entry.key))
      for (const tab of entry.tabs) on.add(tab);
  const result = {} as Record<TabKey, boolean>;
  for (const tab of TAB_KEYS) result[tab] = on.has(tab);
  return result;
}

export type PlanType = "package" | "custom";

export type CreditKey =
  | "email"
  | "sms"
  | "whatsapp"
  | "ai"
  | "storage"
  | "members"
  | "branches"
  | "forms"
  | "groups"
  | "admins"
  | "staff"
  | "kmeet"
  | "instagram"
  | "youtube";

export interface CreditType {
  key: CreditKey;
  label: string;
  unit: string;
  group:
    | "Messaging and AI"
    | "Capacity"
    | "Team"
    | "Calls"
    | "Social media"
    | "Mobile app";
  /** The limit can be set to no limit at all. */
  canBeUnlimited?: boolean;
  /** The largest count that makes sense. */
  max: number;
}

// What the platform admin sets for a custom plan, each with a count (or no limit) and a monthly
// price. The first four are monthly allowances; the rest are the plan's size limits.
export const CREDIT_TYPES: CreditType[] = [
  {
    key: "email",
    label: "Emails",
    unit: "per month",
    group: "Messaging and AI",
    max: 100_000_000,
  },
  {
    key: "sms",
    label: "SMS",
    unit: "per month",
    group: "Messaging and AI",
    max: 100_000_000,
  },
  {
    key: "whatsapp",
    label: "WhatsApp messages",
    unit: "per month",
    group: "Messaging and AI",
    max: 100_000_000,
  },
  {
    key: "ai",
    label: "AI replies",
    unit: "per month",
    group: "Messaging and AI",
    max: 100_000_000,
  },
  {
    key: "storage",
    label: "Storage",
    unit: "GB",
    group: "Capacity",
    max: 100_000,
  },
  {
    key: "members",
    label: "Members",
    unit: "members",
    group: "Capacity",
    canBeUnlimited: true,
    max: 10_000_000,
  },
  {
    key: "branches",
    label: "Branches",
    unit: "branches",
    group: "Capacity",
    canBeUnlimited: true,
    max: 100_000,
  },
  {
    key: "forms",
    label: "Forms",
    unit: "forms",
    group: "Capacity",
    canBeUnlimited: true,
    max: 1_000_000,
  },
  {
    key: "groups",
    label: "Chat groups",
    unit: "groups",
    group: "Capacity",
    canBeUnlimited: true,
    max: 100_000,
  },
  {
    key: "admins",
    label: "Admin logins",
    unit: "besides the owner",
    group: "Team",
    max: 10_000,
  },
  {
    key: "staff",
    label: "Staff logins",
    unit: "besides the owner",
    group: "Team",
    max: 10_000,
  },
  {
    key: "kmeet",
    label: "K-Connect call length",
    unit: "minutes per call",
    group: "Calls",
    canBeUnlimited: true,
    max: 1_440,
  },
  {
    key: "instagram",
    label: "Instagram accounts",
    unit: "accounts",
    group: "Social media",
    max: 1_000,
  },
  {
    key: "youtube",
    label: "YouTube channels",
    unit: "channels",
    group: "Social media",
    max: 1_000,
  },
];

// Most limits of a custom package are sold in blocks above what the Starter plan includes. The Starter number is
// included for nothing; each further block costs the rate in EXTRA_PRICING (the same rate as the add-on packs), and
// the count only ever moves a block at a time. The price follows from the count and is never typed in. The limits
// not listed here (K-Connect minutes) are priced by hand, and mobile app features are the Starter's 15 for everyone.
export interface SteppedRule {
  /** What the Starter plan includes: the least a count can be, and the starting point. */
  included: number;
  /** The size of one block: counts go up or down by this much. */
  step: number;
  /** Rupees a month, before GST, for each block above the included amount. */
  price: number;
}

export const STEPPED_CREDITS: Partial<Record<CreditKey, SteppedRule>> = {
  email: { included: PLANS.basic.emailsPerMonth, ...EXTRA_PRICING.email },
  sms: { included: PLANS.basic.smsPerMonth, ...EXTRA_PRICING.sms },
  whatsapp: {
    included: PLANS.basic.whatsappPerMonth,
    ...EXTRA_PRICING.whatsapp,
  },
  ai: { included: PLANS.basic.aiRepliesPerMonth, ...EXTRA_PRICING.ai },
  storage: {
    included: PLANS.basic.storageBytes / 1024 ** 3,
    ...EXTRA_PRICING.storageGb,
  },
  members: { included: PLANS.basic.memberLimit ?? 0, ...EXTRA_PRICING.members },
  branches: {
    included: PLANS.basic.branchLimit ?? 0,
    ...EXTRA_PRICING.branches,
  },
  forms: { included: PLANS.basic.formsLimit ?? 0, ...EXTRA_PRICING.forms },
  groups: { included: PLANS.basic.groupLimit ?? 0, ...EXTRA_PRICING.groups },
  admins: {
    included: PLANS.basic.maxAdditionalAdmins,
    ...EXTRA_PRICING.admins,
  },
  staff: { included: PLANS.basic.maxAdditionalStaff, ...EXTRA_PRICING.staff },
  instagram: {
    included: PLANS.basic.instagramAccountLimit,
    ...EXTRA_PRICING.socialAccount,
  },
  youtube: {
    included: PLANS.basic.youtubeAccountLimit,
    ...EXTRA_PRICING.socialAccount,
  },
};

export function steppedRule(key: CreditKey): SteppedRule | null {
  return STEPPED_CREDITS[key] ?? null;
}

/** The nearest allowed count at or below this one (never below what Starter includes). */
export function snapCount(key: CreditKey, count: number): number {
  const rule = steppedRule(key);
  if (!rule) return count;
  if (!Number.isFinite(count) || count <= rule.included) return rule.included;
  return (
    rule.included +
    Math.floor((Math.floor(count) - rule.included) / rule.step) * rule.step
  );
}

/** Monthly price, before GST, of a count: nothing for what Starter includes, the block rate for each block above. */
export function creditPrice(key: CreditKey, count: number): number {
  const rule = steppedRule(key);
  if (!rule) return 0;
  return ((snapCount(key, count) - rule.included) / rule.step) * rule.price;
}

/** The count one block up or down (never below what Starter includes, never above the largest allowed). */
export function stepCount(
  key: CreditKey,
  count: number,
  direction: 1 | -1,
): number {
  const rule = steppedRule(key);
  if (!rule) return count;
  const max = snapCount(
    key,
    CREDIT_TYPES.find((t) => t.key === key)?.max ?? count,
  );
  return Math.min(
    Math.max(snapCount(key, count) + direction * rule.step, rule.included),
    max,
  );
}

// Members, kept under their own names (the first limit sold this way).
export const MEMBERS_INCLUDED = STEPPED_CREDITS.members!.included;
export const MEMBERS_STEP = STEPPED_CREDITS.members!.step;
export const MEMBERS_STEP_PRICE = STEPPED_CREDITS.members!.price;
export const isValidMembersCount = (count: number) =>
  Number.isInteger(count) &&
  count >= MEMBERS_INCLUDED &&
  (count - MEMBERS_INCLUDED) % MEMBERS_STEP === 0;
export const snapMembersCount = (count: number) => snapCount("members", count);
export const membersPrice = (count: number) => creditPrice("members", count);
export const stepMembersCount = (count: number, direction: 1 | -1) =>
  stepCount("members", count, direction);

export interface CreditLine {
  /** Ignored when unlimited. */
  count: number;
  unlimited?: boolean;
  price: number; // per month, before GST
}

export type Credits = Partial<Record<CreditKey, CreditLine>>;

// Only well-formed lines: a count above zero (within what makes sense) or, where allowed, no limit.
export function cleanCredits(input: unknown): Credits {
  const result: Credits = {};
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  for (const type of CREDIT_TYPES) {
    const line = source[type.key] as
      { count?: unknown; price?: unknown; unlimited?: unknown } | undefined;
    const price = Math.round(Number(line?.price) * 100) / 100;
    const priceOk = Number.isFinite(price) && price >= 0;
    if (type.canBeUnlimited && line?.unlimited === true && priceOk) {
      result[type.key] = { count: 0, unlimited: true, price };
      continue;
    }
    const count = Math.floor(Number(line?.count));
    // Sold in blocks above what Starter includes: the count snaps to a block and the price is worked out from it.
    const rule = steppedRule(type.key);
    if (rule) {
      // Less than what Starter includes means nothing was chosen: Starter's number applies without a line.
      if (
        Number.isFinite(count) &&
        count >= rule.included &&
        count <= type.max
      ) {
        const snapped = snapCount(type.key, count);
        result[type.key] = {
          count: snapped,
          price: creditPrice(type.key, snapped),
        };
      }
      continue;
    }
    if (Number.isFinite(count) && count > 0 && count <= type.max && priceOk)
      result[type.key] = { count, price };
  }
  return result;
}

// "5,000 per month", "Unlimited members".
export function creditText(type: CreditType, line: CreditLine): string {
  return line.unlimited
    ? `${type.label}: unlimited`
    : `${type.label}: ${line.count.toLocaleString("en-IN")} ${type.unit}`;
}

export interface Quote {
  base: number;
  gst: number;
  total: number;
  overMandateLimit: boolean;
}

// The monthly price of the chosen modules and credit allowances: before GST, the GST on it, and what is charged.
export function quoteFor(
  moduleKeys: string[],
  prices: Record<string, number>,
  credits: Credits = {},
): Quote {
  const modulesBase = moduleKeys.reduce(
    (sum, key) => sum + (prices[key] ?? 0),
    0,
  );
  const creditsBase = Object.values(credits).reduce(
    (sum, line) => sum + (line?.price ?? 0),
    0,
  );
  const priced = withGst(modulesBase + creditsBase);
  return {
    base: priced.base,
    gst: priced.gst,
    total: priced.total,
    overMandateLimit: priced.total > MANDATE_LIMIT_RUPEES,
  };
}

export interface OnboardingDocType {
  type: string;
  label: string;
  help: string;
  required: boolean;
}

// The documents collected from a tenant. Only two are mandatory: a personal ID proof and an address proof. The rest
// are optional and can be added when the tenant has them. (The ID's stored type stays "signatory_id", the key
// documents already uploaded were saved under.)
export const ONBOARDING_DOCS: OnboardingDocType[] = [
  {
    type: "signatory_id",
    label: "Personal ID proof",
    help: "Government photo ID of the person: Aadhaar, passport, voter ID or driving licence.",
    required: true,
  },
  {
    type: "address_proof",
    label: "Address proof",
    help: "Recent utility bill, rent agreement, bank statement or similar showing the address.",
    required: true,
  },
  {
    type: "registration",
    label: "Registration certificate",
    help: "Trust deed, society or company registration, if there is one.",
    required: false,
  },
  {
    type: "pan",
    label: "Organisation PAN card",
    help: "PAN of the organisation, if it has one.",
    required: false,
  },
  {
    type: "agreement",
    label: "Signed service agreement",
    help: "The signed KingdomFlow agreement, if one was signed.",
    required: false,
  },
  {
    type: "bank",
    label: "Bank proof",
    help: "Cancelled cheque or bank statement, for payouts.",
    required: false,
  },
  {
    type: "gst",
    label: "GST registration certificate",
    help: "If the organisation is registered for GST.",
    required: false,
  },
  {
    type: "other",
    label: "Other",
    help: "Anything else that is needed.",
    required: false,
  },
];

export function docLabel(type: string): string {
  return ONBOARDING_DOCS.find((d) => d.type === type)?.label ?? type;
}
