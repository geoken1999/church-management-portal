"use server";

import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReportRows } from "@/lib/reports/dal";
import { buildReportWorkbook, buildReportPdf } from "@/lib/reports/export";
import { getReportDefinition, type ReportFilters, type ReportId } from "@/lib/reports/registry";

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

  const rows = await getReportRows(organizationId, reportId, filters);

  const admin = createAdminClient();
  const { data: organization } = await admin.from("organizations").select("name, slug").eq("id", organizationId).maybeSingle();
  const slug = organization?.slug ?? "report";

  if (format === "excel") {
    const bytes = buildReportWorkbook(definition, rows);
    return {
      base64: Buffer.from(bytes).toString("base64"),
      filename: `${slug}-${definition.id}-report.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  const bytes = buildReportPdf(definition, rows, organization?.name ?? "Report");
  return {
    base64: Buffer.from(bytes).toString("base64"),
    filename: `${slug}-${definition.id}-report.pdf`,
    mimeType: "application/pdf",
  };
}
