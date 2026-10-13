import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MonthlyReportData } from "@/lib/reports/monthly";
import type { MonthlyReport } from "@/types/database";

export type SavedMonthlyReport = Omit<MonthlyReport, "data"> & { data: MonthlyReportData };

export const getMonthlyReports = cache(async (organizationId: string): Promise<SavedMonthlyReport[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("monthly_reports").select("*").eq("organization_id", organizationId).order("period", { ascending: false }).limit(60);
  return (data ?? []) as SavedMonthlyReport[];
});

export const getMonthlyReport = cache(async (organizationId: string, id: string): Promise<SavedMonthlyReport | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("monthly_reports").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  return (data as SavedMonthlyReport | null) ?? null;
});

export interface SavedReportTemplate {
  id: string;
  name: string;
  config: import("@/lib/reports/monthly").ReportTemplateConfig;
}

export const getReportTemplates = cache(async (organizationId: string): Promise<SavedReportTemplate[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("report_templates").select("id, name, config").eq("organization_id", organizationId).order("name");
  return (data ?? []) as SavedReportTemplate[];
});
