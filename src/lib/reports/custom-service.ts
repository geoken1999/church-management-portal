import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getReportRows } from "@/lib/reports/dal";
import { buildReportPdf, buildReportWorkbook } from "@/lib/reports/export";
import { isDue, narrowDefinition, reportFilters } from "@/lib/reports/custom";
import { getReportDefinition } from "@/lib/reports/registry";
import { normalizeTabPermissions } from "@/lib/permissions/tabs";
import { getOrgFeatureState } from "@/lib/plans/dal";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { CustomReport } from "@/types/database";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface BuiltCustomReport {
  bytes: ArrayBuffer;
  filename: string;
  mimeType: string;
  rowCount: number;
}

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report";

/** Runs a saved report as of `now` and makes its file, with the dates and columns it was saved with. */
export async function buildCustomReport(report: CustomReport, now = new Date()): Promise<BuiltCustomReport | { error: string }> {
  const definition = narrowDefinition(report);
  if (!definition) return { error: "This report has no valid columns." };
  const admin = createAdminClient();
  // The organization filter is part of every report query, so the service client reads only this church's rows.
  const rows = await getReportRows(report.organization_id, report.source as never, reportFilters(report, now), admin);
  const { data: organization } = await admin.from("organizations").select("name").eq("id", report.organization_id).maybeSingle();
  const stamp = now.toISOString().slice(0, 10);
  if (report.format === "pdf") {
    return { bytes: buildReportPdf(definition, rows, organization?.name ?? "Report"), filename: `${slugify(report.name)}-${stamp}.pdf`, mimeType: "application/pdf", rowCount: rows.length };
  }
  return { bytes: buildReportWorkbook(definition, rows), filename: `${slugify(report.name)}-${stamp}.xlsx`, mimeType: XLSX_MIME, rowCount: rows.length };
}

/** Whether the person who saved the report can still see its data: still a member, and the module still on. */
async function creatorStillAllowed(report: CustomReport): Promise<boolean> {
  const tab = getReportDefinition(report.source)?.tab;
  if (!tab || !report.created_by) return false;
  const [{ data: member }, state] = await Promise.all([
    createAdminClient().from("organization_members").select("role, tab_permissions").eq("organization_id", report.organization_id).eq("auth_user_id", report.created_by).maybeSingle(),
    getOrgFeatureState(report.organization_id),
  ]);
  if (!member || !state.tabs.reports || !state.tabs[tab]) return false;
  if (member.role === "owner" || member.role === "admin") return true;
  const access = normalizeTabPermissions(member.tab_permissions);
  return access.reports.read && access[tab].read;
}

/** Emails a saved report to its recipients. Returns an error message, or null when it went out. */
export async function emailCustomReport(report: CustomReport, recipients: string[], now = new Date()): Promise<string | null> {
  if (!isEmailConfigured()) return "Email sending isn't configured for this app yet.";
  if (recipients.length === 0) return "Add at least one email address.";
  const built = await buildCustomReport(report, now);
  if ("error" in built) return built.error;
  const { data: organization } = await createAdminClient().from("organizations").select("name").eq("id", report.organization_id).maybeSingle();
  const churchName = organization?.name ?? "Your church";
  const result = await sendBulkEmail({
    fromName: "KingdomFlow Reports",
    subject: `${report.name} — ${churchName}`,
    html: `<p style="font-family: sans-serif;">Your <strong>${report.name.replace(/</g, "&lt;")}</strong> report is attached (${built.rowCount} record${built.rowCount === 1 ? "" : "s"}).</p><p style="font-family: sans-serif; color: #666; font-size: 12px;">Sent by KingdomFlow on ${churchName}'s schedule. Change or stop it from Reports → Custom reports.</p>`,
    recipients,
    attachments: [{ filename: built.filename, content: Buffer.from(built.bytes), contentType: built.mimeType }],
    organizationId: report.organization_id,
  });
  return result.failed.length > 0 ? (result.failed[0]?.error ?? "Couldn't send that email.") : null;
}

/** Sends every scheduled report that is due today. A failure on one never stops the others. */
export async function runDueCustomReports(now = new Date()): Promise<{ checked: number; sent: number; failed: number; skipped: number }> {
  const admin = createAdminClient();
  const { data } = await admin.from("custom_reports").select("*").neq("frequency", "none");
  const reports = (data ?? []) as CustomReport[];
  const summary = { checked: reports.length, sent: 0, failed: 0, skipped: 0 };

  for (const report of reports) {
    if (!isDue(report, now)) continue;
    let status: string;
    try {
      if (!(await creatorStillAllowed(report))) {
        summary.skipped += 1;
        status = "Skipped: the person who made this report can no longer see this data";
      } else {
        const error = await emailCustomReport(report, report.recipients, now);
        if (error) {
          summary.failed += 1;
          status = `Failed: ${error}`;
          await logPlatformEvent({ level: "warning", source: "email_send", message: `Scheduled report "${report.name}" failed: ${error}`, organizationId: report.organization_id });
        } else {
          summary.sent += 1;
          status = "Sent";
        }
      }
    } catch (err) {
      summary.failed += 1;
      status = `Failed: ${err instanceof Error ? err.message : "unknown error"}`;
    }
    await admin.from("custom_reports").update({ last_run_at: now.toISOString(), last_status: status }).eq("id", report.id);
  }
  return summary;
}
