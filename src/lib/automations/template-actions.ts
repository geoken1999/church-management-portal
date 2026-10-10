"use server";

import { getWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { createMetaTemplate, deleteMetaTemplate, fetchMetaTemplateStatus } from "@/lib/whatsapp/templates-client";
import { describeWhatsAppError } from "@/lib/whatsapp/graph-error";
import { extractVariableNames, toPositionalBody } from "@/lib/automations/template-mapping";
import { validateAutomationTemplateName, validateAutomationTemplateBody, validateAutomationTemplateKind } from "@/lib/automations/validation";
import type { AutomationTemplateKind, WhatsAppTemplateCategory } from "@/types/database";

const AUTOMATIONS_PATH = "/dashboard/automations/templates";

// A bad template affects deliverability on the one shared WhatsApp number
// for every org, same bar as whatsapp/actions.ts's own copy of this
// check — duplicated here rather than shared, matching this codebase's
// existing per-module convention for this small helper.
async function requireOrgAdmin(organizationId: string, authUserId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}

export interface AutomationTemplateFormState {
  error?: string;
  success?: boolean;
}

export async function createAutomationTemplateAction(params: {
  organizationId: string;
  metaTemplateName: string;
  category: WhatsAppTemplateCategory;
  bodyTextNamed: string;
  kind: AutomationTemplateKind;
  exampleValues: Record<string, string>;
}): Promise<AutomationTemplateFormState> {
  const user = await requireUser();

  if (!(await requireOrgAdmin(params.organizationId, user.id))) {
    return { error: "Only an owner or admin can create an automation template." };
  }

  const name = params.metaTemplateName.trim().toLowerCase();
  const nameError = validateAutomationTemplateName(name);
  if (nameError) return { error: nameError };
  const bodyError = validateAutomationTemplateBody(params.bodyTextNamed);
  if (bodyError) return { error: bodyError };
  const kindError = validateAutomationTemplateKind(params.bodyTextNamed, params.kind);
  if (kindError) return { error: kindError };
  if (params.category !== "marketing" && params.category !== "utility" && params.category !== "authentication") {
    return { error: "Select a valid template category." };
  }

  const variableNames = extractVariableNames(params.bodyTextNamed);
  const positionalBody = toPositionalBody(params.bodyTextNamed, variableNames);
  const exampleValues = variableNames.map((v) => params.exampleValues[v] ?? "");
  if (variableNames.length > 0 && exampleValues.some((v) => !v.trim())) {
    return { error: "Provide an example value for every variable in your message." };
  }

  const admin = createAdminClient();

  let metaResult;
  try {
    metaResult = await createMetaTemplate({ name, language: "en_US", category: params.category, bodyText: positionalBody, exampleValues, credentials: await getWhatsAppCredentials(params.organizationId) });
  } catch (err) {
    const detail = describeWhatsAppError(err);
    await logPlatformEvent({
      level: "error",
      source: "automation_send",
      message: `Template create failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: params.organizationId,
      metadata: { name, code: detail.code, type: detail.type },
    });
    return { error: detail.message };
  }

  const { error: insertError } = await admin.from("automation_templates").insert({
    organization_id: params.organizationId,
    meta_template_name: name,
    language: "en_US",
    category: params.category,
    body_text_named: params.bodyTextNamed,
    variable_names: variableNames,
    kind: params.kind,
    meta_template_id: metaResult.metaTemplateId,
    status: metaResult.status,
    created_by: user.id,
  });

  if (insertError) {
    return { error: insertError.message.includes("duplicate") ? "A template with that name already exists." : "Couldn't save that template." };
  }

  revalidatePath(AUTOMATIONS_PATH);
  return { success: true };
}

export async function refreshAutomationTemplateStatusAction(templateId: string): Promise<AutomationTemplateFormState> {
  await requireUser();

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("automation_templates")
    .select("organization_id, meta_template_id")
    .eq("id", templateId)
    .maybeSingle();

  if (!template) return { error: "That template could not be found." };

  const access = await checkTabAccess(template.organization_id, "automations", "read");
  if (!access.ok) return { error: access.message };

  if (!template.meta_template_id) return { error: "This template was never submitted to WhatsApp." };

  try {
    const { status, rejectedReason } = await fetchMetaTemplateStatus(template.meta_template_id, await getWhatsAppCredentials(template.organization_id));
    await admin.from("automation_templates").update({ status, rejected_reason: rejectedReason }).eq("id", templateId);
  } catch (err) {
    return { error: describeWhatsAppError(err).message };
  }

  revalidatePath(AUTOMATIONS_PATH);
  return { success: true };
}

export async function deleteAutomationTemplateAction(templateId: string): Promise<AutomationTemplateFormState> {
  const user = await requireUser();

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("automation_templates")
    .select("organization_id, meta_template_name")
    .eq("id", templateId)
    .maybeSingle();

  if (!template) return { error: "That template could not be found." };

  if (!(await requireOrgAdmin(template.organization_id, user.id))) {
    return { error: "Only an owner or admin can delete an automation template." };
  }

  try {
    await deleteMetaTemplate(template.meta_template_name, await getWhatsAppCredentials(template.organization_id));
  } catch (err) {
    // Don't block deleting our own record if Meta's side is already gone
    // (e.g. removed independently) — same tradeoff whatsapp/actions.ts makes.
    const detail = describeWhatsAppError(err);
    await logPlatformEvent({
      level: "warning",
      source: "automation_send",
      message: `Template delete on Meta failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: template.organization_id,
      metadata: { code: detail.code, type: detail.type },
    });
  }

  const { error } = await admin.from("automation_templates").delete().eq("id", templateId);
  if (error) return { error: "Couldn't delete that template." };

  revalidatePath(AUTOMATIONS_PATH);
  return { success: true };
}
