"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkTabAccess } from "@/lib/permissions/dal";
import { buildMonthlyReport } from "@/lib/reports/monthly-generate";
import { isFinishedMonth, isPeriod, isSectionKey, MONTHLY_SECTIONS, periodLabel, type MonthlySectionKey } from "@/lib/reports/monthly";
import { logPlatformEvent } from "@/lib/platform-events/log";

const PATH = "/dashboard/reports";

export interface MonthlyReportResult {
  error?: string;
  success?: boolean;
  id?: string;
}

// Generates (or regenerates) the monthly report for one finished month. Needs Write
// on the Reports tab, and the person can include only the sections whose own tab
// they may read: a report never shows more than its maker could already see.
export async function generateMonthlyReportAction(input: { period: string; sections: string[]; note: string }): Promise<MonthlyReportResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "reports", "write");
  if (!access.ok) return { error: access.message };

  if (!isPeriod(input.period)) return { error: "Choose a month." };
  if (!isFinishedMonth(input.period, new Date())) return { error: "That month isn't over yet. Choose a month that has finished." };

  const requested = input.sections.filter(isSectionKey);
  const sections: MonthlySectionKey[] = [];
  for (const section of MONTHLY_SECTIONS) {
    if (!requested.includes(section.key)) continue;
    const need = section.key === "giving" ? ["offerings", "donations"] : [section.tab];
    if (need.every((tab) => membership.tabAccess[tab as keyof typeof membership.tabAccess]?.read)) sections.push(section.key);
  }
  if (sections.length === 0) return { error: "Choose at least one section you have access to." };

  const note = input.note.trim().slice(0, 1500);
  const data = await buildMonthlyReport(organizationId, input.period, sections, membership.organization.timezone);

  const { data: saved, error } = await createAdminClient()
    .from("monthly_reports")
    .upsert(
      { organization_id: organizationId, period: input.period, title: `${periodLabel(input.period)} report`, note: note || null, data: data as unknown as Record<string, unknown>, created_by: user.id },
      { onConflict: "organization_id,period" },
    )
    .select("id")
    .single();
  if (error || !saved) {
    await logPlatformEvent({ level: "error", source: "platform_admin", message: `Monthly report failed: ${error?.message ?? "no row"}`, organizationId });
    return { error: "Couldn't save that report. Please try again." };
  }

  revalidatePath(PATH);
  return { success: true, id: saved.id };
}

// Publishing shows the report to every member in the app, so only an owner or admin can.
export async function setMonthlyReportPublishedAction(id: string, published: boolean): Promise<MonthlyReportResult> {
  await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only an owner or admin can publish a report to members." };

  const { error } = await createAdminClient().from("monthly_reports").update({ published }).eq("id", id).eq("organization_id", membership.organization.id);
  if (error) return { error: "Couldn't update that report." };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteMonthlyReportAction(id: string): Promise<MonthlyReportResult> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "reports", "delete");
  if (!access.ok) return { error: access.message };

  const { error } = await createAdminClient().from("monthly_reports").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return { error: "Couldn't delete that report." };
  revalidatePath(PATH);
  return { success: true };
}
