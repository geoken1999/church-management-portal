"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReportRows } from "@/lib/reports/dal";
import { getReportDefinition, type ReportId } from "@/lib/reports/registry";
import { MAX_RECIPIENTS, narrowDefinition, parseRecipients, reportFilters, type DateWindow, type Frequency } from "@/lib/reports/custom";
import { emailCustomReport } from "@/lib/reports/custom-service";
import type { CustomReport } from "@/types/database";

const PATH = "/dashboard/reports";

export interface CustomReportInput {
  id?: string;
  name: string;
  source: string;
  columns: string[];
  filters: CustomReport["filters"];
  dateWindow: DateWindow;
  dateFrom?: string;
  dateTo?: string;
  format: "excel" | "pdf";
  frequency: Frequency;
  scheduleDay?: number;
  /** Comma or space separated addresses. */
  recipients: string;
}

export interface CustomReportState {
  error?: string;
  success?: boolean;
  rows?: Record<string, string>[];
  sentTo?: string[];
}

const DATE_WINDOWS: DateWindow[] = ["all", "last_7_days", "last_30_days", "this_month", "last_month", "this_year", "custom"];
const FREQUENCIES: Frequency[] = ["none", "daily", "weekly", "monthly"];

// Both the author and the data module are checked: a report can only be built from data the person may read.
async function authorise(organizationId: string, source: string) {
  const definition = getReportDefinition(source);
  if (!definition) return { error: "Choose what the report is about." } as const;
  const reports = await checkTabAccess(organizationId, "reports", "write");
  if (!reports.ok) return { error: reports.message } as const;
  const data = await checkTabAccess(organizationId, definition.tab, "read");
  if (!data.ok) return { error: data.message } as const;
  return { definition, userId: reports.userId } as const;
}

function validate(input: CustomReportInput, definition: NonNullable<ReturnType<typeof getReportDefinition>>) {
  const name = input.name.trim();
  if (!name) return { error: "Give the report a name." } as const;
  if (name.length > 80) return { error: "Keep the name under 80 characters." } as const;
  const columns = input.columns.filter((key, i) => definition.columns.some((c) => c.key === key) && input.columns.indexOf(key) === i);
  if (columns.length === 0) return { error: "Pick at least one column." } as const;
  if (!DATE_WINDOWS.includes(input.dateWindow) || !FREQUENCIES.includes(input.frequency)) return { error: "Something in the form isn't valid." } as const;
  if (input.dateWindow === "custom" && input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) return { error: "The start date is after the end date." } as const;

  const allowed = new Set(definition.filters.map((f) => f.key));
  const filters: CustomReport["filters"] = {};
  if (allowed.has("branchId") && input.filters.branchId) filters.branchId = input.filters.branchId;
  if (allowed.has("status") && input.filters.status) filters.status = input.filters.status;
  if (allowed.has("method") && input.filters.method) filters.method = input.filters.method;

  const { emails, invalid } = parseRecipients(input.recipients);
  if (invalid.length > 0) return { error: `These aren't email addresses: ${invalid.join(", ")}.` } as const;
  if (emails.length > MAX_RECIPIENTS) return { error: `Send to at most ${MAX_RECIPIENTS} addresses.` } as const;
  if (input.frequency !== "none" && emails.length === 0) return { error: "Add who should receive it by email." } as const;

  let scheduleDay: number | null = null;
  if (input.frequency === "weekly") scheduleDay = Number.isInteger(input.scheduleDay) && input.scheduleDay! >= 0 && input.scheduleDay! <= 6 ? input.scheduleDay! : 1;
  if (input.frequency === "monthly") scheduleDay = Number.isInteger(input.scheduleDay) && input.scheduleDay! >= 1 && input.scheduleDay! <= 28 ? input.scheduleDay! : 1;

  return {
    row: {
      name,
      source: definition.id,
      columns,
      filters,
      date_window: input.dateWindow,
      date_from: input.dateWindow === "custom" ? input.dateFrom || null : null,
      date_to: input.dateWindow === "custom" ? input.dateTo || null : null,
      format: input.format === "pdf" ? ("pdf" as const) : ("excel" as const),
      frequency: input.frequency,
      schedule_day: scheduleDay,
      recipients: emails,
    },
  } as const;
}

export async function saveCustomReport(organizationId: string, input: CustomReportInput): Promise<CustomReportState> {
  const auth = await authorise(organizationId, input.source);
  if ("error" in auth) return { error: auth.error };
  const checked = validate(input, auth.definition);
  if ("error" in checked) return { error: checked.error };

  const admin = createAdminClient();
  if (input.id) {
    const { error } = await admin.from("custom_reports").update(checked.row).eq("id", input.id).eq("organization_id", organizationId);
    if (error) return { error: "Couldn't save the report. Please try again." };
  } else {
    const { error } = await admin.from("custom_reports").insert({ ...checked.row, organization_id: organizationId, created_by: auth.userId });
    if (error) return { error: "Couldn't save the report. Please try again." };
  }
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteCustomReport(organizationId: string, id: string): Promise<CustomReportState> {
  const access = await checkTabAccess(organizationId, "reports", "delete");
  if (!access.ok) return { error: access.message };
  const { error } = await createAdminClient().from("custom_reports").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return { error: "Couldn't delete the report." };
  revalidatePath(PATH);
  return { success: true };
}

// Runs the report as it is being built, with the dates the chosen window means today.
export async function previewCustomReport(organizationId: string, input: CustomReportInput): Promise<CustomReportState> {
  await requireUser();
  const auth = await authorise(organizationId, input.source);
  if ("error" in auth) return { error: auth.error };
  const checked = validate({ ...input, frequency: "none" }, auth.definition);
  if ("error" in checked) return { error: checked.error };
  const definition = narrowDefinition(checked.row);
  if (!definition) return { error: "Pick at least one column." };
  const rows = await getReportRows(organizationId, auth.definition.id as ReportId, reportFilters(checked.row, new Date()));
  return { rows: rows.slice(0, 200) };
}

// Sends a saved report now, to its own recipients or, when it has none, to the person asking.
export async function sendCustomReportNow(organizationId: string, id: string): Promise<CustomReportState> {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data } = await admin.from("custom_reports").select("*").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!data) return { error: "That report no longer exists." };
  const report = data as CustomReport;
  const auth = await authorise(organizationId, report.source);
  if ("error" in auth) return { error: auth.error };
  const recipients = report.recipients.length > 0 ? report.recipients : user.email ? [user.email] : [];
  const error = await emailCustomReport(report, recipients);
  if (error) return { error };
  return { success: true, sentTo: recipients };
}
