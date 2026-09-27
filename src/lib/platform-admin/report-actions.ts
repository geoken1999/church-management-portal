"use server";

import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getAllTenants, getTenantUsage, type TenantUsage } from "@/lib/platform-admin/dal";
import { buildReportWorkbook, buildReportPdf } from "@/lib/reports/export";
import { formatBytes } from "@/lib/plans/format";

function formatMoney(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export interface ExportReportResult {
  error?: string;
  base64?: string;
  filename?: string;
  mimeType?: string;
}

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_MIME = "application/pdf";

function toBase64Result(bytes: ArrayBuffer, filenameBase: string, format: "excel" | "pdf"): ExportReportResult {
  return {
    base64: Buffer.from(bytes).toString("base64"),
    filename: format === "excel" ? `${filenameBase}.xlsx` : `${filenameBase}.pdf`,
    mimeType: format === "excel" ? EXCEL_MIME : PDF_MIME,
  };
}

// One row per tenant, summary columns only — for the "export all tenants"
// button on the Tenants list page.
const TENANTS_SUMMARY_REPORT = {
  label: "Tenants",
  columns: [
    { key: "name", label: "Church" },
    { key: "plan", label: "Plan" },
    { key: "status", label: "Status" },
    { key: "members", label: "Members", align: "right" as const },
    { key: "branches", label: "Branches", align: "right" as const },
    { key: "teamLogins", label: "Team logins", align: "right" as const },
    { key: "emailsMonth", label: "Emails (month)", align: "right" as const },
    { key: "smsMonth", label: "SMS (month)", align: "right" as const },
    { key: "whatsappMonth", label: "WhatsApp (month)", align: "right" as const },
    { key: "storage", label: "Storage used", align: "right" as const },
    { key: "donations", label: "Donations (all time)", align: "right" as const },
    { key: "joined", label: "Joined" },
  ],
};

function toSummaryRow(usage: TenantUsage): Record<string, string> {
  return {
    name: usage.name,
    plan: usage.planName,
    status: usage.subscriptionStatus ?? "—",
    members: String(usage.congregationMembers),
    branches: String(usage.branches),
    teamLogins: String(usage.teamLogins),
    emailsMonth: String(usage.emailsSentThisMonth),
    smsMonth: String(usage.smsSentThisMonth),
    whatsappMonth: String(usage.whatsappSentThisMonth),
    storage: formatBytes(usage.storageBytesUsed),
    donations: formatMoney(usage.donationsTotalAllTime),
    joined: new Date(usage.createdAt).toLocaleDateString(),
  };
}

export async function exportTenantsReport(format: "excel" | "pdf"): Promise<ExportReportResult> {
  await requirePlatformAdmin();

  const tenants = await getAllTenants();
  const usages = (await Promise.all(tenants.map((t) => getTenantUsage(t.id)))).filter((u): u is TenantUsage => u !== null);
  const rows = usages.map(toSummaryRow);

  const bytes =
    format === "excel" ? buildReportWorkbook(TENANTS_SUMMARY_REPORT, rows) : buildReportPdf(TENANTS_SUMMARY_REPORT, rows, "KingdomFlow");
  return toBase64Result(bytes, "kingdomflow-tenants-report", format);
}

// Metric/value pairs rather than one very-wide row — this tenant has 20+
// figures, and a single row with that many columns reads badly in a PDF
// (even landscape) or a printed Excel sheet. A label/value list is the
// same shape the detail page itself shows on screen.
const TENANT_DETAIL_REPORT = {
  label: "Tenant Detail",
  columns: [
    { key: "metric", label: "Metric" },
    { key: "value", label: "Value" },
  ],
};

function toDetailRows(usage: TenantUsage): Record<string, string>[] {
  return [
    { metric: "Plan", value: usage.planName },
    { metric: "Subscription status", value: usage.subscriptionStatus ?? "—" },
    { metric: "Trial ends", value: usage.trialEndsAt ? new Date(usage.trialEndsAt).toLocaleDateString() : "—" },
    { metric: "Joined", value: new Date(usage.createdAt).toLocaleDateString() },
    { metric: "Congregation members", value: String(usage.congregationMembers) },
    { metric: "Branches (actual / self-reported)", value: `${usage.branches} / ${usage.branchCountClaimed ?? "—"}` },
    { metric: "Team logins", value: String(usage.teamLogins) },
    { metric: "Leaders", value: String(usage.leaders) },
    { metric: "Youth", value: String(usage.youth) },
    { metric: "Families", value: String(usage.families) },
    { metric: "Events", value: String(usage.eventsCount) },
    { metric: "Active fundraisers", value: String(usage.activeFundraisers) },
    { metric: "Donations (all time)", value: formatMoney(usage.donationsTotalAllTime) },
    { metric: "Offerings (all time)", value: formatMoney(usage.offeringsTotalAllTime) },
    { metric: "Support tickets", value: String(usage.supportTicketsCount) },
    { metric: "Emails sent (this month / all time)", value: `${usage.emailsSentThisMonth} / ${usage.emailsSentAllTime}` },
    { metric: "SMS sent (this month / all time)", value: `${usage.smsSentThisMonth} / ${usage.smsSentAllTime}` },
    { metric: "WhatsApp sent (this month / all time)", value: `${usage.whatsappSentThisMonth} / ${usage.whatsappSentAllTime}` },
    { metric: "Delivery failures (last 30 days)", value: String(usage.deliveryFailuresLast30Days) },
    { metric: "Storage used / limit", value: `${formatBytes(usage.storageBytesUsed)} / ${formatBytes(usage.storageBytesLimit)}` },
    { metric: "Add-on SMS credits", value: String(usage.addonSmsCredits) },
    { metric: "Add-on email credits", value: String(usage.addonEmailCredits) },
    { metric: "Add-on WhatsApp credits", value: String(usage.addonWhatsappCredits) },
    { metric: "Add-on storage", value: formatBytes(usage.addonStorageBytes) },
  ];
}

export async function exportTenantReport(organizationId: string, format: "excel" | "pdf"): Promise<ExportReportResult> {
  await requirePlatformAdmin();

  const usage = await getTenantUsage(organizationId);
  if (!usage) return { error: "That tenant could not be found." };

  const rows = toDetailRows(usage);
  const bytes = format === "excel" ? buildReportWorkbook(TENANT_DETAIL_REPORT, rows) : buildReportPdf(TENANT_DETAIL_REPORT, rows, usage.name);
  return toBase64Result(bytes, `${usage.slug}-tenant-report`, format);
}
