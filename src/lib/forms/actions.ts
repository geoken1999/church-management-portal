"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { validateFormMeta, sanitizeFormFields } from "@/lib/forms/validation";
import { slugify, randomSlugSuffix } from "@/lib/organizations/validation";
import type { FormStatus } from "@/types/database";

const FORMS_PATH = "/dashboard/forms";
const FORM_STATUSES: FormStatus[] = ["draft", "published", "closed"];

// Forms are RLS-restricted to admins by default (see migration 0048) —
// the admin client performs the actual write so a "member" role granted
// write/delete via the tab permissions matrix can still perform it; the
// checkTabAccess call is what actually gates who gets here.
async function organizationIdForForm(formId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("forms").select("organization_id").eq("id", formId).maybeSingle();
  return data?.organization_id ?? null;
}

function readFieldsFromFormData(formData: FormData) {
  const raw = String(formData.get("fields") ?? "[]");
  try {
    return sanitizeFormFields(JSON.parse(raw));
  } catch {
    return [];
  }
}

export interface FormMetaState {
  error?: string;
  fieldErrors?: { title?: string };
  success?: boolean;
  formId?: string;
}

export async function createForm(_prevState: FormMetaState, formData: FormData): Promise<FormMetaState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const access = await checkTabAccess(organizationId, "forms", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "").trim();

  const fieldErrors = validateFormMeta({ title });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const baseSlug = slugify(title) || "form";

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSlugSuffix()}`;
    const { data, error } = await admin
      .from("forms")
      .insert({
        organization_id: organizationId,
        title: title.trim(),
        description: description || null,
        slug,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (!error && data) {
      revalidatePath(FORMS_PATH);
      return { success: true, formId: data.id };
    }

    if (!error?.message.toLowerCase().includes("duplicate") && !error?.message.includes("unique")) {
      return { error: "Couldn't create that form. Please try again." };
    }
  }

  return { error: "Couldn't create that form. Try a different title." };
}

export async function updateForm(_prevState: FormMetaState, formData: FormData): Promise<FormMetaState> {
  await requireUser();

  const formId = String(formData.get("formId") ?? "");
  const organizationId = await organizationIdForForm(formId);
  if (!organizationId) {
    return { error: "That form could not be found." };
  }
  const access = await checkTabAccess(organizationId, "forms", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const fields = readFieldsFromFormData(formData);

  const fieldErrors = validateFormMeta({ title });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("forms")
    .update({
      title: title.trim(),
      description: description || null,
      fields,
    })
    .eq("id", formId);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath(FORMS_PATH);
  revalidatePath(`${FORMS_PATH}/${formId}`);
  return { success: true, formId };
}

export async function setFormStatus(formData: FormData) {
  await requireUser();
  const formId = String(formData.get("formId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!FORM_STATUSES.includes(status as FormStatus)) return;

  const organizationId = await organizationIdForForm(formId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "forms", "write");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("forms").update({ status: status as FormStatus }).eq("id", formId);

  revalidatePath(FORMS_PATH);
  revalidatePath(`${FORMS_PATH}/${formId}`);
}

export async function deleteForm(formData: FormData) {
  await requireUser();
  const formId = String(formData.get("formId") ?? "");

  const organizationId = await organizationIdForForm(formId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "forms", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("forms").delete().eq("id", formId);

  revalidatePath(FORMS_PATH);
}

export async function deleteFormResponse(formData: FormData) {
  await requireUser();
  const responseId = String(formData.get("responseId") ?? "");
  const formId = String(formData.get("formId") ?? "");

  const organizationId = await organizationIdForForm(formId);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "forms", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("form_responses").delete().eq("id", responseId);

  revalidatePath(`${FORMS_PATH}/${formId}`);
}
