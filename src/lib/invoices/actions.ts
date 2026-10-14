"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { sampleDocument } from "@/lib/invoices/document";
import { emailInvoice, invoiceFileName, invoicePdf } from "@/lib/invoices/issue";
import { normalizeInvoiceTemplate, templateProblems, type InvoiceTemplate } from "@/lib/invoices/template";
import { saveInvoiceTemplate } from "@/lib/invoices/template-store";
import type { PlatformInvoice } from "@/types/database";

const PATH = "/platform-admin/invoice-template";
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

export interface InvoiceTemplateState {
  error?: string;
  success?: boolean;
  // What is still missing for real invoices to be valid.
  missing?: string[];
  template?: InvoiceTemplate;
}

export async function saveInvoiceTemplateAction(input: unknown): Promise<InvoiceTemplateState> {
  await requirePlatformAdmin();
  const template = normalizeInvoiceTemplate(input);
  const saved = await saveInvoiceTemplate(template);
  if (saved.error) return { error: saved.error };
  revalidatePath(PATH);
  return { success: true, template, missing: templateProblems(template) };
}

// The logo shown on invoices: a PNG or JPEG up to 1 MB, kept in a public bucket.
export async function uploadInvoiceLogoAction(formData: FormData): Promise<{ error?: string; url?: string }> {
  await requirePlatformAdmin();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a logo." };
  const extension = LOGO_TYPES[file.type];
  if (!extension) return { error: "The logo must be a PNG or JPEG." };
  if (file.size > 1024 * 1024) return { error: "The logo must be under 1 MB." };
  const admin = createAdminClient();
  const path = `logo-${Date.now()}.${extension}`;
  const { error } = await admin.storage.from("invoice-assets").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: "Couldn't upload the logo. Please try again." };
  return { url: admin.storage.from("invoice-assets").getPublicUrl(path).data.publicUrl };
}

// Emails a sample invoice (made from the saved template) to the signed-in Super Admin.
export async function sendTestInvoiceAction(): Promise<{ error?: string; sentTo?: string }> {
  const user = await requirePlatformAdmin();
  if (!user.email) return { error: "Your account has no email address." };
  if (!isEmailConfigured()) return { error: "Email isn't configured." };
  const { loadInvoiceTemplate } = await import("@/lib/invoices/template-store");
  const doc = sampleDocument(await loadInvoiceTemplate());
  const result = await sendBulkEmail({
    fromName: "KingdomFlow Billing",
    subject: `Sample invoice ${doc.invoiceNumber}`,
    html: "<p>This is a sample invoice made from your saved invoice template. It is not a real invoice.</p>",
    recipients: [user.email],
    attachments: [{ filename: invoiceFileName(doc.invoiceNumber), content: await invoicePdf(doc), contentType: "application/pdf" }],
  });
  return result.sentCount > 0 ? { sentTo: user.email } : { error: result.failed[0]?.error ?? "The email wasn't sent." };
}

// Sends an issued invoice to its buyer again (for example after fixing a wrong email).
export async function resendInvoiceAction(id: string): Promise<{ error?: string; success?: boolean }> {
  await requirePlatformAdmin();
  const { data } = await createAdminClient().from("platform_invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return { error: "That invoice could not be found." };
  const result = await emailInvoice(data as PlatformInvoice);
  revalidatePath(PATH);
  return result.ok ? { success: true } : { error: result.error ?? "The email wasn't sent." };
}
