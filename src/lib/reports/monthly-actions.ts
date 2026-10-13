"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkTabAccess } from "@/lib/permissions/dal";
import { checkAiCreditQuota, checkStorageQuota, recordAiReplyUsage } from "@/lib/plans/dal";
import { buildMonthlyReport } from "@/lib/reports/monthly-generate";
import { writeReportNarrative } from "@/lib/reports/narrative";
import {
  isFinishedPeriod,
  isPeriodOfKind,
  isReportLanguage,
  isReportTone,
  isSectionKey,
  MAX_REPORT_PHOTOS,
  MONTHLY_SECTIONS,
  periodLabelIn,
  type Letterhead,
  type MonthlyReportData,
  type MonthlySectionKey,
  type ReportKind,
  type ReportPhoto,
  type ReportTemplateConfig,
} from "@/lib/reports/monthly";
import { logPlatformEvent } from "@/lib/platform-events/log";

const PATH = "/dashboard/reports";
const BUCKET = "report-images";

export interface MonthlyReportResult {
  error?: string;
  warning?: string;
  success?: boolean;
  id?: string;
}

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function cleanLetterhead(input: Partial<Letterhead> | undefined, fallbackName: string): Letterhead {
  return {
    churchName: clip(input?.churchName, 120) || fallbackName,
    address: clip(input?.address, 300),
    phone: clip(input?.phone, 40),
    email: clip(input?.email, 120),
    website: clip(input?.website, 120),
  };
}

export interface GenerateInput {
  kind: ReportKind;
  period: string;
  branchId: string | null;
  language: string;
  sections: string[];
  note: string;
  ai: boolean;
  tone: string;
  letterhead?: Partial<Letterhead>;
}

// Generates (or regenerates) the report for one finished month or year, for the whole
// church or one branch. Needs Write on the Reports tab, and the person can include only
// the sections whose own tab they may read: a report never shows more than its maker
// could already see.
export async function generateMonthlyReportAction(input: GenerateInput): Promise<MonthlyReportResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "reports", "write");
  if (!access.ok) return { error: access.message };

  const kind: ReportKind = input.kind === "annual" ? "annual" : "monthly";
  if (!isPeriodOfKind(kind, input.period)) return { error: kind === "annual" ? "Choose a year." : "Choose a month." };
  if (!isFinishedPeriod(input.period, new Date())) return { error: kind === "annual" ? "That year isn't over yet. Choose a year that has finished." : "That month isn't over yet. Choose a month that has finished." };

  const language = isReportLanguage(input.language) ? input.language : "en";
  const tone = isReportTone(input.tone) ? input.tone : "warm";

  const admin = createAdminClient();
  let branchId: string | null = null;
  if (input.branchId) {
    const { data: branch } = await admin.from("branches").select("id").eq("id", input.branchId).eq("organization_id", organizationId).maybeSingle();
    if (!branch) return { error: "That branch could not be found." };
    branchId = branch.id;
  }

  const requested = input.sections.filter(isSectionKey);
  const sections: MonthlySectionKey[] = [];
  for (const section of MONTHLY_SECTIONS) {
    if (!requested.includes(section.key)) continue;
    const need = section.key === "giving" ? ["offerings", "donations"] : [section.tab];
    if (need.every((tab) => membership.tabAccess[tab as keyof typeof membership.tabAccess]?.read)) sections.push(section.key);
  }
  if (sections.length === 0) return { error: "Choose at least one section you have access to." };

  const letterhead = cleanLetterhead(input.letterhead, membership.organization.name);
  const data = await buildMonthlyReport({ organizationId, period: input.period, sections, timeZone: membership.organization.timezone, language, branchId, letterhead, logoUrl: membership.organization.logo_url });

  // The AI summary, if asked for and the church still has AI credits.
  let warning: string | undefined;
  if (input.ai) {
    const quotaError = await checkAiCreditQuota(organizationId);
    if (quotaError) {
      warning = "The report was made without an AI summary: your church has no AI credits left this month.";
    } else {
      const narrative = await writeReportNarrative({ data, churchName: letterhead.churchName, language, tone });
      if (narrative) {
        data.narrative = narrative;
        await recordAiReplyUsage(organizationId, "report");
      } else {
        warning = "The report was made, but the AI summary couldn't be written this time. Make the report again to retry.";
      }
    }
  }

  // The same church, period and branch is one report: making it again replaces its figures
  // but keeps its photos.
  let existingQuery = admin.from("monthly_reports").select("id, data").eq("organization_id", organizationId).eq("period", input.period);
  existingQuery = branchId ? existingQuery.eq("branch_id", branchId) : existingQuery.is("branch_id", null);
  const { data: existing } = await existingQuery.maybeSingle();
  if (existing) data.photos = (existing.data as MonthlyReportData | null)?.photos ?? [];

  const label = periodLabelIn(input.period, language);
  const row = {
    organization_id: organizationId,
    kind,
    branch_id: branchId,
    language,
    period: input.period,
    title: `${label} ${kind === "annual" ? "annual report" : "report"}${data.branchName ? ` · ${data.branchName}` : ""}`,
    note: clip(input.note, 1500) || null,
    data: data as unknown as Record<string, unknown>,
    created_by: user.id,
  };
  const { data: saved, error } = existing
    ? await admin.from("monthly_reports").update(row).eq("id", existing.id).select("id").single()
    : await admin.from("monthly_reports").insert(row).select("id").single();
  if (error || !saved) {
    await logPlatformEvent({ level: "error", source: "platform_admin", message: `Report failed: ${error?.message ?? "no row"}`, organizationId });
    return { error: "Couldn't save that report. Please try again." };
  }

  revalidatePath(PATH);
  return { success: true, id: saved.id, warning };
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

  const admin = createAdminClient();
  const { data: report } = await admin.from("monthly_reports").select("data").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  const { error } = await admin.from("monthly_reports").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return { error: "Couldn't delete that report." };
  // Its photos go with it.
  const photos = (report?.data as MonthlyReportData | null)?.photos ?? [];
  if (photos.length > 0) await admin.storage.from(BUCKET).remove(photos.map((p) => p.path));
  revalidatePath(PATH);
  return { success: true };
}

// --- Photos ----------------------------------------------------------------

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

// Adds a photo (for example from an event) to a report. Counts against the church's storage.
export async function addReportPhotoAction(formData: FormData): Promise<MonthlyReportResult> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "reports", "write");
  if (!access.ok) return { error: access.message };

  const reportId = String(formData.get("reportId") ?? "");
  const caption = clip(formData.get("caption"), 140);
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  const extension = PHOTO_TYPES[file.type];
  if (!extension) return { error: "Photos must be JPEG, PNG or WebP." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "That photo is over 3 MB. Choose a smaller one." };

  const admin = createAdminClient();
  const { data: report } = await admin.from("monthly_reports").select("data").eq("id", reportId).eq("organization_id", organizationId).maybeSingle();
  if (!report) return { error: "That report could not be found." };
  const data = report.data as MonthlyReportData;
  const photos = data.photos ?? [];
  if (photos.length >= MAX_REPORT_PHOTOS) return { error: `A report can have at most ${MAX_REPORT_PHOTOS} photos.` };

  const quotaError = await checkStorageQuota(organizationId, file.size);
  if (quotaError) return { error: quotaError };

  const path = `${organizationId}/${reportId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { error: "Couldn't upload that photo. Please try again." };

  const next: ReportPhoto[] = [...photos, { path, caption }];
  const { error } = await admin.from("monthly_reports").update({ data: { ...data, photos: next } as unknown as Record<string, unknown> }).eq("id", reportId);
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Couldn't add that photo to the report." };
  }
  revalidatePath(PATH);
  return { success: true };
}

export async function removeReportPhotoAction(reportId: string, path: string): Promise<MonthlyReportResult> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "reports", "write");
  if (!access.ok) return { error: access.message };

  const admin = createAdminClient();
  const { data: report } = await admin.from("monthly_reports").select("data").eq("id", reportId).eq("organization_id", organizationId).maybeSingle();
  if (!report) return { error: "That report could not be found." };
  const data = report.data as MonthlyReportData;
  const photos = (data.photos ?? []).filter((p) => p.path !== path);
  await admin.from("monthly_reports").update({ data: { ...data, photos } as unknown as Record<string, unknown> }).eq("id", reportId);
  if (path.startsWith(`${organizationId}/`)) await admin.storage.from(BUCKET).remove([path]);
  revalidatePath(PATH);
  return { success: true };
}

// --- Templates ---------------------------------------------------------------

export async function saveReportTemplateAction(name: string, config: Omit<ReportTemplateConfig, "kind">): Promise<MonthlyReportResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "reports", "write");
  if (!access.ok) return { error: access.message };

  const cleanName = clip(name, 60);
  if (cleanName.length < 2) return { error: "Give the template a name." };
  const clean: Omit<ReportTemplateConfig, "kind"> = {
    sections: config.sections.filter(isSectionKey),
    language: isReportLanguage(config.language) ? config.language : "en",
    ai: Boolean(config.ai),
    tone: isReportTone(config.tone) ? config.tone : "warm",
    note: clip(config.note, 1500),
    letterhead: cleanLetterhead(config.letterhead, membership.organization.name),
  };
  const { error } = await createAdminClient()
    .from("report_templates")
    .upsert({ organization_id: organizationId, name: cleanName, config: clean as unknown as Record<string, unknown>, created_by: user.id }, { onConflict: "organization_id,name" });
  if (error) return { error: "Couldn't save that template." };
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteReportTemplateAction(id: string): Promise<MonthlyReportResult> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "reports", "delete");
  if (!access.ok) return { error: access.message };
  const { error } = await createAdminClient().from("report_templates").delete().eq("id", id).eq("organization_id", organizationId);
  if (error) return { error: "Couldn't delete that template." };
  revalidatePath(PATH);
  return { success: true };
}
