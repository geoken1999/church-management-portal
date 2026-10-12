import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanUsage } from "@/lib/plans/dal";
import { validateFormMeta, sanitizeFormFields } from "@/lib/forms/validation";
import { slugify, randomSlugSuffix } from "@/lib/organizations/validation";
import { collectTranslatableStrings, sanitizeBilingual } from "@/lib/bilingual/config";
import { ensureTranslations } from "@/lib/bilingual/translate";
import type { FormStatus } from "@/types/database";

// The staff mobile app's Forms changes: the same rules as the web's server
// actions (src/lib/forms/actions.ts), for a bearer-token caller. Who may do it
// was checked by the route.

export type FormsResult = { ok: true; id?: string; warning?: string } | { ok: false; error: string };
const fail = (error: string): FormsResult => ({ ok: false, error });

export async function createFormForMobile(organizationId: string, userId: string, titleRaw: string, descriptionRaw: string): Promise<FormsResult> {
  const { plan } = await getPlanUsage(organizationId);
  const admin = createAdminClient();
  if (plan.formsLimit !== null) {
    const { count } = await admin.from("forms").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
    if ((count ?? 0) >= plan.formsLimit) return fail(`Your ${plan.name} plan allows up to ${plan.formsLimit} forms. Remove one or upgrade your plan to add more.`);
  }

  const errors = validateFormMeta({ title: titleRaw });
  if (errors.title) return fail(errors.title);
  const title = titleRaw.trim();
  const description = descriptionRaw.trim();

  const baseSlug = slugify(title) || "form";
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSlugSuffix()}`;
    const { data, error } = await admin
      .from("forms")
      .insert({ organization_id: organizationId, title, description: description || null, slug, created_by: userId })
      .select("id")
      .single();
    if (!error && data) return { ok: true, id: data.id };
    if (!error?.message.toLowerCase().includes("duplicate") && !error?.message.includes("unique")) return fail("Couldn't create that form. Please try again.");
  }
  return fail("Couldn't create that form. Try a different title.");
}

export async function updateFormForMobile(organizationId: string, id: string, titleRaw: string, descriptionRaw: string, fieldsRaw: unknown): Promise<FormsResult> {
  const errors = validateFormMeta({ title: titleRaw });
  if (errors.title) return fail(errors.title);
  const title = titleRaw.trim();
  const description = descriptionRaw.trim();
  const fields = sanitizeFormFields(fieldsRaw);

  const admin = createAdminClient();
  const { data: current } = await admin.from("forms").select("bilingual").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!current) return fail("That form could not be found.");

  // If the form shows two languages, keep the translations up to date with the
  // new text, as the web does; the app has no language editor of its own.
  let bilingual = sanitizeBilingual(current.bilingual);
  let warning: string | undefined;
  if (bilingual) {
    const outcome = await ensureTranslations(bilingual, collectTranslatableStrings({ title, description, fields }), sanitizeBilingual(current.bilingual));
    bilingual = outcome.config;
    warning = outcome.warning;
  }

  const { error } = await admin
    .from("forms")
    .update({ title, description: description || null, fields, bilingual })
    .eq("id", id)
    .eq("organization_id", organizationId);
  return error ? fail("Couldn't save those changes. Please try again.") : { ok: true, id, warning };
}

const STATUSES: FormStatus[] = ["draft", "published", "closed"];

export async function setFormStatusForMobile(organizationId: string, id: string, status: string): Promise<FormsResult> {
  if (!STATUSES.includes(status as FormStatus)) return fail("Invalid status.");
  const admin = createAdminClient();
  const { error } = await admin.from("forms").update({ status: status as FormStatus }).eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't change that. Please try again.") : { ok: true };
}

export async function deleteFormForMobile(organizationId: string, id: string): Promise<FormsResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("forms").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't delete that form.") : { ok: true };
}

export async function deleteResponseForMobile(organizationId: string, responseId: string): Promise<FormsResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("form_responses").delete().eq("id", responseId).eq("organization_id", organizationId);
  return error ? fail("Couldn't delete that response.") : { ok: true };
}
