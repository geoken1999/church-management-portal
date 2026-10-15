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

export interface Quote {
  base: number;
  gst: number;
  total: number;
  overMandateLimit: boolean;
}

// The monthly price of the chosen modules: before GST, the GST on it, and what is charged.
export function quoteFor(
  moduleKeys: string[],
  prices: Record<string, number>,
): Quote {
  const base = moduleKeys.reduce((sum, key) => sum + (prices[key] ?? 0), 0);
  const { gst, total } = withGst(base);
  return {
    base: withGst(base).base,
    gst,
    total,
    overMandateLimit: total > MANDATE_LIMIT_RUPEES,
  };
}

export interface OnboardingDocType {
  type: string;
  label: string;
  help: string;
  required: boolean;
}

// The legal documents collected from a tenant.
export const ONBOARDING_DOCS: OnboardingDocType[] = [
  {
    type: "registration",
    label: "Registration certificate",
    help: "Trust deed, society or company registration.",
    required: true,
  },
  {
    type: "pan",
    label: "Organisation PAN card",
    help: "PAN of the organisation.",
    required: true,
  },
  {
    type: "signatory_id",
    label: "Authorised signatory ID",
    help: "Government ID of the person signing for the organisation.",
    required: true,
  },
  {
    type: "address_proof",
    label: "Address proof",
    help: "Recent utility bill, rent agreement or similar for the registered address.",
    required: true,
  },
  {
    type: "agreement",
    label: "Signed service agreement",
    help: "The signed KingdomFlow agreement.",
    required: true,
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
