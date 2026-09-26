"use server";

import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReportRows } from "@/lib/reports/dal";
import { buildReportWorkbook, buildReportPdf } from "@/lib/reports/export";
import { getReportDefinition, type ReportDefinition, type ReportFilters, type ReportId } from "@/lib/reports/registry";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";

export interface RunReportState {
  error?: string;
  rows?: Record<string, string>[];
}

export async function runReport(organizationId: string, reportId: ReportId, filters: ReportFilters): Promise<RunReportState> {
  await requireUser();

  const definition = getReportDefinition(reportId);
  if (!definition) {
    return { error: "Unknown report." };
  }

  const access = await checkTabAccess(organizationId, definition.tab, "read");
  if (!access.ok) {
    return { error: access.message };
  }

  const rows = await getReportRows(organizationId, reportId, filters);
  return { rows };
}

// Shared by exportReport and emailReport — both need the exact same file,
// just delivered differently (a download vs. an email attachment).
async function buildReportFile(
  organizationId: string,
  definition: ReportDefinition,
  filters: ReportFilters,
  format: "excel" | "pdf",
): Promise<{ bytes: ArrayBuffer; filename: string; mimeType: string }> {
  const rows = await getReportRows(organizationId, definition.id, filters);

  const admin = createAdminClient();
  const { data: organization } = await admin.from("organizations").select("name, slug").eq("id", organizationId).maybeSingle();
  const slug = organization?.slug ?? "report";

  if (format === "excel") {
    return {
      bytes: buildReportWorkbook(definition, rows),
      filename: `${slug}-${definition.id}-report.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  return {
    bytes: buildReportPdf(definition, rows, organization?.name ?? "Report"),
    filename: `${slug}-${definition.id}-report.pdf`,
    mimeType: "application/pdf",
  };
}

export interface ExportReportState {
  error?: string;
  base64?: string;
  filename?: string;
  mimeType?: string;
}

export async function exportReport(
  organizationId: string,
  reportId: ReportId,
  filters: ReportFilters,
  format: "excel" | "pdf",
): Promise<ExportReportState> {
  await requireUser();

  const definition = getReportDefinition(reportId);
  if (!definition) {
    return { error: "Unknown report." };
  }

  const access = await checkTabAccess(organizationId, definition.tab, "read");
  if (!access.ok) {
    return { error: access.message };
  }

  const { bytes, filename, mimeType } = await buildReportFile(organizationId, definition, filters, format);
  return { base64: Buffer.from(bytes).toString("base64"), filename, mimeType };
}

export interface EmailReportState {
  error?: string;
  success?: boolean;
  sentTo?: string;
}

// Sends the exact same file exportReport would download, as an email
// attachment to the requesting user's own address instead — no separate
// "who should this go to" input, since the common case is just wanting a
// copy in your own inbox rather than downloading through the browser.
export async function emailReport(
  organizationId: string,
  reportId: ReportId,
  filters: ReportFilters,
  format: "excel" | "pdf",
): Promise<EmailReportState> {
  const user = await requireUser();
  if (!user.email) {
    return { error: "Your account has no email address on file." };
  }
  if (!isEmailConfigured()) {
    return { error: "Email sending isn't configured for this app yet." };
  }

  const definition = getReportDefinition(reportId);
  if (!definition) {
    return { error: "Unknown report." };
  }

  const access = await checkTabAccess(organizationId, definition.tab, "read");
  if (!access.ok) {
    return { error: access.message };
  }

  const { bytes, filename, mimeType } = await buildReportFile(organizationId, definition, filters, format);

  const admin = createAdminClient();
  const { data: organization } = await admin.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const organizationName = organization?.name ?? "Your church";

  const result = await sendBulkEmail({
    fromName: "KingdomFlow Reports",
    subject: `${definition.label} — ${organizationName}`,
    html: `<p style="font-family: sans-serif;">Your ${definition.label.toLowerCase()} report is attached.</p>`,
    recipients: [user.email],
    attachments: [{ filename, content: Buffer.from(bytes), contentType: mimeType }],
    organizationId,
  });

  if (result.failed.length > 0) {
    return { error: result.failed[0]?.error ?? "Couldn't send that email. Please try again." };
  }

  return { success: true, sentTo: user.email };
}
