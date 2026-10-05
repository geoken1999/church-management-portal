// Pure rules for monthly membership fees. No server imports, so the cron, the
// settings form and the report all use the same checks.

import { dateKeyInTimezone } from "@/lib/organizations/timezone";

export type MembershipInvoiceStatus = "due" | "paid" | "cancelled";

export interface MembershipFeeSettingsInput {
  enabled: boolean;
  amount: number | null;
  dueDay: number;
  reminderAfterDays: number;
}

export interface MembershipFeeSettingsErrors {
  amount?: string;
  dueDay?: string;
  reminderAfterDays?: string;
}

export function validateMembershipFeeSettings(input: MembershipFeeSettingsInput): MembershipFeeSettingsErrors {
  const errors: MembershipFeeSettingsErrors = {};
  if (input.enabled && (input.amount === null || !Number.isFinite(input.amount) || input.amount <= 0)) {
    errors.amount = "Enter the monthly amount, greater than 0, before turning this on.";
  } else if (input.amount !== null && (!Number.isFinite(input.amount) || input.amount <= 0)) {
    errors.amount = "The monthly amount must be greater than 0.";
  }
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 28) {
    errors.dueDay = "Choose a day between 1 and 28.";
  }
  if (!Number.isInteger(input.reminderAfterDays) || input.reminderAfterDays < 1 || input.reminderAfterDays > 28) {
    errors.reminderAfterDays = "Choose between 1 and 28 days.";
  }
  return errors;
}

// 'YYYY-MM' for the organization's current month.
export function membershipPeriodFor(now: Date, timeZone: string): string {
  return dateKeyInTimezone(now, timeZone).slice(0, 7);
}

// True on the organization's configured day of the month, in its own timezone.
export function isMembershipDueDay(now: Date, timeZone: string, dueDay: number): boolean {
  const day = Number(dateKeyInTimezone(now, timeZone).slice(8, 10));
  return day === dueDay;
}

// The period `delta` months away from a 'YYYY-MM' period.
export function shiftMembershipPeriod(period: string, delta: number): string {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 'July 2026' for a 'YYYY-MM' period.
export function membershipPeriodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function membershipPaymentPath(token: string): string {
  return `/pay/membership/${token}`;
}

export interface MembershipInvoiceForSummary {
  amount: number;
  status: MembershipInvoiceStatus;
  hasEmail: boolean;
}

export interface MembershipPeriodSummary {
  requested: number;
  expected: number;
  collected: number;
  outstanding: number;
  paidCount: number;
  dueCount: number;
  withoutEmailCount: number;
}

// Totals for one month's report. Cancelled requests are left out entirely.
export function summarizeMembershipPeriod(invoices: MembershipInvoiceForSummary[]): MembershipPeriodSummary {
  const live = invoices.filter((i) => i.status !== "cancelled");
  const paid = live.filter((i) => i.status === "paid");
  const due = live.filter((i) => i.status === "due");
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    requested: live.length,
    expected: round2(live.reduce((sum, i) => sum + i.amount, 0)),
    collected: round2(paid.reduce((sum, i) => sum + i.amount, 0)),
    outstanding: round2(due.reduce((sum, i) => sum + i.amount, 0)),
    paidCount: paid.length,
    dueCount: due.length,
    withoutEmailCount: due.filter((i) => !i.hasEmail).length,
  };
}
