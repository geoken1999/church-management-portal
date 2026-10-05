// Pure helpers for the platform earnings and expenses pages. No server
// imports, so the same rules run in the portal and in tests.

import { DEFAULT_TIMEZONE, dateKeyInTimezone } from "@/lib/organizations/timezone";

// Services KingdomFlow pays for. Keep in step with the check constraint on
// platform_expenses.service (migration 0111).
export const PLATFORM_SERVICES = [
  { key: "supabase", label: "Supabase (database & auth)" },
  { key: "vercel", label: "Vercel (hosting & cron)" },
  { key: "razorpay_fees", label: "Razorpay gateway fees" },
  { key: "meta_whatsapp", label: "WhatsApp (Meta Cloud API)" },
  { key: "sms", label: "SMS provider" },
  { key: "email", label: "Email delivery" },
  { key: "ai", label: "AI provider" },
  { key: "domain", label: "Domain & DNS" },
  { key: "other", label: "Other" },
] as const;

export type PlatformServiceKey = (typeof PLATFORM_SERVICES)[number]["key"];

export function isPlatformServiceKey(value: string): value is PlatformServiceKey {
  return PLATFORM_SERVICES.some((s) => s.key === value);
}

export function platformServiceLabel(key: string): string {
  return PLATFORM_SERVICES.find((s) => s.key === key)?.label ?? key;
}

// Month buckets are read in Indian time, the platform's own timezone, so a
// payment made just after midnight IST lands in the right month.
export function monthKeyOfDate(isoDateOrTimestamp: string, timeZone = DEFAULT_TIMEZONE): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDateOrTimestamp)) return isoDateOrTimestamp.slice(0, 7);
  return dateKeyInTimezone(new Date(isoDateOrTimestamp), timeZone).slice(0, 7);
}

// The last `count` calendar months ending with the current one, oldest first.
export function recentMonthKeys(now: Date, count: number, timeZone = DEFAULT_TIMEZONE): string[] {
  const current = dateKeyInTimezone(now, timeZone).slice(0, 7);
  const [year, month] = current.split("-").map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export interface ExpenseInputErrors {
  service?: string;
  description?: string;
  amount?: string;
  paidOn?: string;
}

export function validateExpenseInput(input: { service: string; description: string; amount: number; paidOn: string }): ExpenseInputErrors {
  const errors: ExpenseInputErrors = {};
  if (!isPlatformServiceKey(input.service)) errors.service = "Choose the service this payment was for.";
  if (!input.description.trim()) errors.description = "Describe what was paid for.";
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.amount = "Enter an amount greater than 0.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || Number.isNaN(Date.parse(`${input.paidOn}T00:00:00Z`))) {
    errors.paidOn = "Enter the date it was paid.";
  }
  return errors;
}
