// Pure constants and sums for tenant onboarding, safe to import from client components.
import { TAB_KEYS, TAB_LABELS, type TabKey } from "@/lib/permissions/tabs";
import { FINANCE_TABS, SOCIAL_TABS } from "@/lib/plans/config";
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
  | "youtube"
  | "mobileFeatures";

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
  {
    key: "mobileFeatures",
    label: "Mobile app features",
    unit: "features (up to 15)",
    group: "Mobile app",
    max: 15,
  },
];

// Members in a custom plan are sold in blocks: 350 are included, and every further block of 100 adds ₹30 a month
// (before GST). The count only ever moves in steps of 100, and the price follows from the count, never typed in.
export const MEMBERS_INCLUDED = 350;
export const MEMBERS_STEP = 100;
export const MEMBERS_STEP_PRICE = 30;

/** Whether a members count is allowed: 350, 450, 550 and so on. */
export function isValidMembersCount(count: number): boolean {
  return (
    Number.isInteger(count) &&
    count >= MEMBERS_INCLUDED &&
    (count - MEMBERS_INCLUDED) % MEMBERS_STEP === 0
  );
}

/** The nearest allowed members count at or below this one (never below the 350 included). */
export function snapMembersCount(count: number): number {
  if (!Number.isFinite(count) || count <= MEMBERS_INCLUDED)
    return MEMBERS_INCLUDED;
  return (
    MEMBERS_INCLUDED +
    Math.floor((Math.floor(count) - MEMBERS_INCLUDED) / MEMBERS_STEP) *
      MEMBERS_STEP
  );
}

/** Monthly price, before GST, of a members count: nothing for the 350 included, ₹30 for each 100 more. */
export function membersPrice(count: number): number {
  return (
    ((snapMembersCount(count) - MEMBERS_INCLUDED) / MEMBERS_STEP) *
    MEMBERS_STEP_PRICE
  );
}

/** The count one step up or down (never below the 350 included, never above the largest allowed). */
export function stepMembersCount(count: number, direction: 1 | -1): number {
  const next = snapMembersCount(count) + direction * MEMBERS_STEP;
  const max = snapMembersCount(
    CREDIT_TYPES.find((t) => t.key === "members")!.max,
  );
  return Math.min(Math.max(next, MEMBERS_INCLUDED), max);
}

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
    // Members come in blocks of 100 above the 350 included, and the price is worked out from the count.
    if (type.key === "members") {
      // Fewer than the 350 included means nothing was chosen: the plan's 350 apply without a line.
      if (
        Number.isFinite(count) &&
        count >= MEMBERS_INCLUDED &&
        count <= type.max
      ) {
        const snapped = snapMembersCount(count);
        result.members = { count: snapped, price: membersPrice(snapped) };
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
