"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import {
  validateWidgetSettings,
  sanitizeWidgetPosition,
  sanitizeWidgetFields,
  DEFAULT_WIDGET_FIELDS,
} from "@/lib/widget/validation";
import type { WidgetSubmissionStatus } from "@/types/database";

const WIDGET_PATH = "/dashboard/widget";
const SUBMISSION_STATUSES: WidgetSubmissionStatus[] = ["new", "read", "archived"];

// Widgets are RLS-restricted to admins for insert/update (see migration
// 0059) — the admin client performs the actual write so a "member" role
// granted write access via the tab permissions matrix can still perform
// it; checkTabAccess is what actually gates who gets here. Mirrors
// organizationIdForForm in forms/actions.ts.
async function organizationIdForWidget(widgetId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("website_widgets").select("organization_id").eq("id", widgetId).maybeSingle();
  return data?.organization_id ?? null;
}

export interface WidgetCreateState {
  error?: string;
  success?: boolean;
}

// One widget per org, created on-demand the first time someone opens the
// Widget page and clicks "Create widget" — mirrors the "connect" flow
// shape used for Razorpay/WhatsApp own accounts rather than the
// createForm shape (a form can be created many times, a widget can't).
export async function createWidget(_prevState: WidgetCreateState, formData: FormData): Promise<WidgetCreateState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const access = await checkTabAccess(organizationId, "widget", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("website_widgets").insert({
    organization_id: organizationId,
    fields: DEFAULT_WIDGET_FIELDS,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message.toLowerCase().includes("duplicate") ? "A widget already exists for this organization." : "Couldn't create the widget. Please try again." };
  }

  revalidatePath(WIDGET_PATH);
  return { success: true };
}

export interface WidgetSettingsState {
  error?: string;
  fieldErrors?: { primaryColor?: string; buttonLabel?: string; greetingTitle?: string };
  success?: boolean;
}

function readFieldsFromFormData(formData: FormData) {
  const raw = String(formData.get("fields") ?? "[]");
  try {
    return sanitizeWidgetFields(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function updateWidgetSettings(_prevState: WidgetSettingsState, formData: FormData): Promise<WidgetSettingsState> {
  await requireUser();

  const widgetId = String(formData.get("widgetId") ?? "");
  const organizationId = await organizationIdForWidget(widgetId);
  if (!organizationId) {
    return { error: "That widget could not be found." };
  }
  const access = await checkTabAccess(organizationId, "widget", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const primaryColor = String(formData.get("primaryColor") ?? "");
  const position = sanitizeWidgetPosition(formData.get("position"));
  const buttonLabel = String(formData.get("buttonLabel") ?? "");
  const greetingTitle = String(formData.get("greetingTitle") ?? "");
  const greetingMessage = String(formData.get("greetingMessage") ?? "").trim();
  const fields = readFieldsFromFormData(formData);

  const fieldErrors = validateWidgetSettings({ primaryColor, buttonLabel, greetingTitle });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("website_widgets")
    .update({
      primary_color: primaryColor.trim(),
      position,
      button_label: buttonLabel.trim(),
      greeting_title: greetingTitle.trim(),
      greeting_message: greetingMessage,
      fields,
    })
    .eq("id", widgetId);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath(WIDGET_PATH);
  return { success: true };
}

export async function toggleWidgetEnabled(formData: FormData) {
  await requireUser();
  const widgetId = String(formData.get("widgetId") ?? "");
  const enabled = formData.get("enabled") === "true";

  const organizationId = await organizationIdForWidget(widgetId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "widget", "write");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("website_widgets").update({ enabled }).eq("id", widgetId);

  revalidatePath(WIDGET_PATH);
}

export async function setWidgetSubmissionStatus(formData: FormData) {
  await requireUser();
  const submissionId = String(formData.get("submissionId") ?? "");
  const widgetId = String(formData.get("widgetId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!SUBMISSION_STATUSES.includes(status as WidgetSubmissionStatus)) return;

  const organizationId = await organizationIdForWidget(widgetId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "widget", "write");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("widget_submissions").update({ status: status as WidgetSubmissionStatus }).eq("id", submissionId);

  revalidatePath(WIDGET_PATH);
}

export async function deleteWidgetSubmission(formData: FormData) {
  await requireUser();
  const submissionId = String(formData.get("submissionId") ?? "");
  const widgetId = String(formData.get("widgetId") ?? "");

  const organizationId = await organizationIdForWidget(widgetId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "widget", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("widget_submissions").delete().eq("id", submissionId);

  revalidatePath(WIDGET_PATH);
}
