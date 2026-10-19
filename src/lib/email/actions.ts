"use server";

import { revalidatePath } from "next/cache";
import { sealSecret, openSecret } from "@/lib/security/connection-secrets";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { sendEmailCampaign } from "@/lib/email/send";
import { verifySmtpConnection } from "@/lib/email/smtp";
import { getEmailSmtpSettings, getLatestEmailSetupRequest } from "@/lib/email/dal";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
} from "@/lib/email/validation";
import { checkStorageQuota, getPlanUsage } from "@/lib/plans/dal";
import type { EmailAttachment } from "@/lib/email/client";

const EMAIL_PATH = "/dashboard/email";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendEmailState {
  error?: string;
  success?: boolean;
  sentCount?: number;
  failedCount?: number;
}

export async function sendBulkEmailAction(formData: FormData): Promise<SendEmailState> {
  const user = await requireUser();
  const membership = await requireOrganization();

  if (!membership.tabAccess.email.write) {
    return { error: "You don't have permission to send email." };
  }

  let rawRecipients: unknown;
  try {
    rawRecipients = JSON.parse(String(formData.get("recipients") ?? "[]"));
  } catch {
    return { error: "Select at least one recipient." };
  }

  const attachmentFiles = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File);
  if (attachmentFiles.length > MAX_ATTACHMENTS) {
    return { error: `You can attach at most ${MAX_ATTACHMENTS} files.` };
  }

  let totalAttachmentBytes = 0;
  for (const file of attachmentFiles) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { error: `"${file.name}" is larger than 5MB.` };
    }
    totalAttachmentBytes += file.size;
  }
  if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return { error: "Attachments are too large combined — keep the total under 20MB." };
  }

  const attachments: EmailAttachment[] = await Promise.all(
    attachmentFiles.map(async (file) => ({
      filename: file.name,
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || undefined,
    })),
  );

  const result = await sendEmailCampaign({
    organizationId: membership.organization.id,
    organizationName: membership.organization.name,
    userId: user.id,
    userEmail: user.email ?? null,
    subject: String(formData.get("subject") ?? ""),
    html: String(formData.get("html") ?? ""),
    rawRecipients,
    attachments,
  });
  revalidatePath(EMAIL_PATH);
  return result;
}

// ---------------------------------------------------------------------------
// Per-org SMTP settings
// ---------------------------------------------------------------------------

const EMAIL_SETTINGS_PATH = "/dashboard/email";

function readSmtpForm(formData: FormData) {
  return {
    host: String(formData.get("host") ?? "").trim(),
    port: Number(formData.get("port")),
    secure: formData.get("secure") === "on",
    username: String(formData.get("username") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    fromEmail: String(formData.get("fromEmail") ?? "").trim(),
    fromName: String(formData.get("fromName") ?? "").trim(),
  };
}

export interface SmtpSettingsState {
  error?: string;
  success?: boolean;
}

export async function testSmtpConnection(formData: FormData): Promise<SmtpSettingsState> {
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can manage email settings." };
  }

  const form = readSmtpForm(formData);
  if (!form.host || !form.port || !form.username) {
    return { error: "Host, port, and username are required." };
  }

  let password = form.password;
  if (!password) {
    const existing = await getEmailSmtpSettings(membership.organization.id);
    password = existing?.password ?? "";
  }
  if (!password) {
    return { error: "Password is required." };
  }

  const result = await verifySmtpConnection({
    host: form.host,
    port: form.port,
    secure: form.secure,
    username: form.username,
    password,
    fromEmail: form.fromEmail,
    fromName: form.fromName,
  });

  return result.ok ? { success: true } : { error: result.error };
}

export async function saveEmailSmtpSettings(formData: FormData): Promise<SmtpSettingsState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can manage email settings." };
  }

  const { plan } = await getPlanUsage(membership.organization.id);
  if (!plan.customSmtpEnabled) {
    return { error: `Your own SMTP isn't included on the ${plan.name} plan.` };
  }

  const form = readSmtpForm(formData);
  if (!form.host || !form.port || !form.username || !form.fromEmail) {
    return { error: "Host, port, username, and from address are required." };
  }
  if (!EMAIL_PATTERN.test(form.fromEmail)) {
    return { error: "Enter a valid from address." };
  }

  const existing = await getEmailSmtpSettings(membership.organization.id);
  // A blank password field means "keep the existing one" — the client never
  // gets the real password back to prefill, so re-typing it every edit
  // would be the only alternative.
  const password = form.password || existing?.password;
  if (!password) {
    return { error: "Password is required." };
  }

  const verification = await verifySmtpConnection({
    host: form.host,
    port: form.port,
    secure: form.secure,
    username: form.username,
    password,
    fromEmail: form.fromEmail,
    fromName: form.fromName,
  });
  if (!verification.ok) {
    return { error: verification.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("email_smtp_settings").upsert(
    {
      organization_id: membership.organization.id,
      host: form.host,
      port: form.port,
      secure: form.secure,
      username: form.username,
      password: sealSecret(password),
      from_email: form.fromEmail,
      from_name: form.fromName || null,
      created_by: user.id,
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    return { error: "Couldn't save those settings. Please try again." };
  }

  revalidatePath(EMAIL_SETTINGS_PATH);
  return { success: true };
}

export async function deleteEmailSmtpSettings(): Promise<void> {
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") {
    return;
  }

  const supabase = await createClient();
  await supabase.from("email_smtp_settings").delete().eq("organization_id", membership.organization.id);

  revalidatePath(EMAIL_SETTINGS_PATH);
}

// ---------------------------------------------------------------------------
// "Raise a ticket" — for orgs that don't want to configure their own SMTP
// and want the app operator to enable the shared Resend provider instead.
// There's no cross-tenant admin dashboard in this app, so this is just the
// intake; the operator reviews open requests directly in Supabase.
// ---------------------------------------------------------------------------

export interface EmailSetupRequestState {
  error?: string;
  success?: boolean;
}

export async function requestEmailSetup(formData: FormData): Promise<EmailSetupRequestState> {
  const user = await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can raise a setup request." };
  }

  const existing = await getLatestEmailSetupRequest(membership.organization.id);
  if (existing?.status === "open") {
    return { error: "A request is already pending." };
  }

  const message = String(formData.get("message") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("email_setup_requests").insert({
    organization_id: membership.organization.id,
    requested_by: user.id,
    message: message || null,
  });

  if (error) {
    return { error: "Couldn't send that request. Please try again." };
  }

  revalidatePath(EMAIL_SETTINGS_PATH);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Inline images (rich text composer's "insert image" toolbar button)
// ---------------------------------------------------------------------------

export interface UploadImageState {
  error?: string;
  url?: string;
}

export async function uploadEmailImage(formData: FormData): Promise<UploadImageState> {
  await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can insert images." };
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "Images must be PNG, JPEG, WebP, or GIF." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Images must be smaller than 5MB." };
  }

  const quotaError = await checkStorageQuota(membership.organization.id, file.size);
  if (quotaError) {
    return { error: quotaError };
  }

  const supabase = await createClient();
  const extension = file.name.split(".").pop() || "png";
  const path = `${membership.organization.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("email-images")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return { error: "Couldn't upload that image. Please try again." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("email-images").getPublicUrl(path);

  return { url: publicUrl };
}
