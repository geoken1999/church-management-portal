"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeEmailHtml } from "@/lib/email/sanitize";
import { MAX_EMAIL_TEMPLATES, MAX_TEMPLATE_HTML_BYTES } from "@/lib/email/templates";

const PATH = "/dashboard/email";

export interface EmailTemplateResult {
  error?: string;
  success?: boolean;
  id?: string;
}

// Saves what is in the composer as a template. A template with the same name is replaced.
export async function saveEmailTemplateAction(input: { name: string; subject: string; html: string }): Promise<EmailTemplateResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (!membership.tabAccess.email.write) return { error: "You don't have permission to save email templates." };

  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Give the template a name." };
  const html = sanitizeEmailHtml(input.html);
  if (!html.replace(/<[^>]*>/g, "").trim() && !input.subject.trim()) return { error: "Write a subject or a message first." };
  if (Buffer.byteLength(html) > MAX_TEMPLATE_HTML_BYTES) return { error: "That message is too large to save as a template." };

  const organizationId = membership.organization.id;
  const admin = createAdminClient();
  const { data: existing } = await admin.from("email_templates").select("id").eq("organization_id", organizationId).eq("name", name).maybeSingle();
  if (!existing) {
    const { count } = await admin.from("email_templates").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
    if ((count ?? 0) >= MAX_EMAIL_TEMPLATES) return { error: `You can keep up to ${MAX_EMAIL_TEMPLATES} templates. Delete one you no longer use.` };
  }

  const { data, error } = await admin
    .from("email_templates")
    .upsert({ organization_id: organizationId, name, subject: input.subject.trim().slice(0, 200), body_html: html, created_by: user.id }, { onConflict: "organization_id,name" })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save that template. Please try again." };
  revalidatePath(PATH);
  return { success: true, id: data.id };
}

export async function deleteEmailTemplateAction(id: string): Promise<EmailTemplateResult> {
  await requireUser();
  const membership = await requireOrganization();
  if (!membership.tabAccess.email.write) return { error: "You don't have permission to delete email templates." };
  const { error } = await createAdminClient().from("email_templates").delete().eq("id", id).eq("organization_id", membership.organization.id);
  if (error) return { error: "Couldn't delete that template." };
  revalidatePath(PATH);
  return { success: true };
}
