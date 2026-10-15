"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOnboardingReadyEmail } from "@/lib/billing/receipts";
import { getSiteUrl } from "@/lib/site-url";
import {
  ONBOARDING_DOCS,
  ONBOARDING_MODULES,
  isModuleKey,
  quoteFor,
} from "@/lib/onboarding/config";
import {
  getModulePricing,
  getOnboarding,
  getOnboardingDocuments,
} from "@/lib/onboarding/store";

const BUCKET = "onboarding-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export interface OnboardingResult {
  error?: string;
  success?: boolean;
}

const pathFor = (organizationId: string) =>
  `/platform-admin/onboarding/${organizationId}`;

// ---- Module pricing and defaults ----

export interface ModulePriceInput {
  key: string;
  price: number;
  isDefault: boolean;
}

export async function saveModulePricingAction(
  rows: ModulePriceInput[],
): Promise<OnboardingResult> {
  await requirePlatformAdmin();
  for (const row of rows) {
    if (!isModuleKey(row.key)) return { error: "Unknown module." };
    if (!Number.isFinite(row.price) || row.price < 0 || row.price > 1_000_000)
      return { error: "Prices must be between 0 and 10,00,000." };
  }
  const { error } = await createAdminClient()
    .from("module_pricing")
    .upsert(
      rows.map((r) => ({
        module_key: r.key,
        monthly_price: Math.round(r.price * 100) / 100,
        is_default: r.isDefault,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "module_key" },
    );
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/platform-admin/modules");
  return { success: true };
}

// ---- One tenant's onboarding ----

async function requireOrganization(organizationId: string) {
  const { data } = await createAdminClient()
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  return data;
}

export async function startOnboardingAction(
  organizationId: string,
): Promise<OnboardingResult> {
  const user = await requirePlatformAdmin();
  if (!(await requireOrganization(organizationId)))
    return { error: "That tenant wasn't found." };
  if (await getOnboarding(organizationId)) return { success: true };
  const pricing = await getModulePricing();
  const defaults = ONBOARDING_MODULES.filter(
    (m) => pricing[m.key]?.is_default,
  ).map((m) => m.key);
  const { error } = await createAdminClient()
    .from("tenant_onboarding")
    .insert({
      organization_id: organizationId,
      modules: defaults,
      started_by: user.id,
    });
  if (error)
    return { error: "Couldn't start the onboarding. Please try again." };
  revalidatePath("/platform-admin/onboarding");
  return { success: true };
}

export async function saveModulesAction(
  organizationId: string,
  modules: string[],
): Promise<OnboardingResult> {
  await requirePlatformAdmin();
  const onboarding = await getOnboarding(organizationId);
  if (!onboarding) return { error: "Start the onboarding first." };
  if (onboarding.status !== "in_progress")
    return {
      error:
        "This onboarding was already sent. Reopen it to change the modules.",
    };
  const clean = ONBOARDING_MODULES.map((m) => m.key).filter((k) =>
    modules.includes(k),
  );
  const { error } = await createAdminClient()
    .from("tenant_onboarding")
    .update({ modules: clean, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) return { error: "Couldn't save the modules. Please try again." };
  revalidatePath(pathFor(organizationId));
  return { success: true };
}

// ---- Documents ----

export async function uploadDocumentAction(
  formData: FormData,
): Promise<OnboardingResult> {
  const user = await requirePlatformAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");
  const docType = String(formData.get("docType") ?? "");
  const file = formData.get("file");
  if (!ONBOARDING_DOCS.some((d) => d.type === docType))
    return { error: "Unknown document type." };
  if (!(await getOnboarding(organizationId)))
    return { error: "Start the onboarding first." };
  if (!(file instanceof File) || file.size === 0)
    return { error: "Choose a file to upload." };
  const ext = FILE_TYPES[file.type];
  if (!ext) return { error: "Use a PDF, JPEG or PNG file." };
  if (file.size > MAX_BYTES) return { error: "That file is over 10 MB." };

  const admin = createAdminClient();
  const path = `${organizationId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
    });
  if (uploadError)
    return { error: "Couldn't upload that file. Please try again." };
  const { error } = await admin
    .from("tenant_onboarding_documents")
    .insert({
      organization_id: organizationId,
      doc_type: docType,
      file_name: file.name.slice(0, 200),
      file_path: path,
      uploaded_by: user.id,
    });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Couldn't save that document. Please try again." };
  }
  revalidatePath(pathFor(organizationId));
  return { success: true };
}

export async function setDocumentStatusAction(
  documentId: string,
  status: "uploaded" | "verified" | "rejected",
  note: string,
): Promise<OnboardingResult> {
  await requirePlatformAdmin();
  if (!["uploaded", "verified", "rejected"].includes(status))
    return { error: "Unknown status." };
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("tenant_onboarding_documents")
    .select("organization_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { error: "That document wasn't found." };
  const { error } = await admin
    .from("tenant_onboarding_documents")
    .update({
      status,
      note: note.trim().slice(0, 300),
      verified_at: status === "verified" ? new Date().toISOString() : null,
    })
    .eq("id", documentId);
  if (error)
    return { error: "Couldn't update the document. Please try again." };
  revalidatePath(pathFor(doc.organization_id));
  return { success: true };
}

export async function deleteDocumentAction(
  documentId: string,
): Promise<OnboardingResult> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("tenant_onboarding_documents")
    .select("organization_id, file_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { error: "That document wasn't found." };
  await admin.storage.from(BUCKET).remove([doc.file_path]);
  const { error } = await admin
    .from("tenant_onboarding_documents")
    .delete()
    .eq("id", documentId);
  if (error)
    return { error: "Couldn't delete the document. Please try again." };
  revalidatePath(pathFor(doc.organization_id));
  return { success: true };
}

// A short-lived link to view a document; the bucket is private.
export async function getDocumentLinkAction(
  documentId: string,
): Promise<{ error?: string; url?: string }> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("tenant_onboarding_documents")
    .select("file_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { error: "That document wasn't found." };
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 300);
  if (error || !data) return { error: "Couldn't open that document." };
  return { url: data.signedUrl };
}

// ---- Send to the tenant ----

export async function sendOnboardingToTenantAction(
  organizationId: string,
): Promise<OnboardingResult> {
  await requirePlatformAdmin();
  const onboarding = await getOnboarding(organizationId);
  if (!onboarding) return { error: "Start the onboarding first." };
  if (onboarding.status === "active")
    return { error: "This tenant is already onboarded." };
  if (onboarding.modules.length === 0)
    return { error: "Choose at least one module." };

  const docs = await getOnboardingDocuments(organizationId);
  const missing = ONBOARDING_DOCS.filter(
    (d) =>
      d.required &&
      !docs.some((doc) => doc.doc_type === d.type && doc.status === "verified"),
  );
  if (missing.length > 0)
    return {
      error: `Verify these documents first: ${missing.map((d) => d.label).join(", ")}.`,
    };

  const pricing = await getModulePricing();
  const prices = Object.fromEntries(
    Object.entries(pricing).map(([k, v]) => [k, v.monthly_price]),
  );
  const quote = quoteFor(onboarding.modules, prices);
  if (quote.base <= 0)
    return {
      error: "Set a price for the chosen modules first (Modules page).",
    };
  if (quote.overMandateLimit)
    return {
      error:
        "The monthly total is over the UPI Autopay limit of ₹15,000. Remove a module or split the plan.",
    };

  const { error } = await createAdminClient()
    .from("tenant_onboarding")
    .update({
      status: "awaiting_payment",
      monthly_base: quote.base,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
  if (error)
    return { error: "Couldn't send this to the tenant. Please try again." };

  const labels = ONBOARDING_MODULES.filter((m) =>
    onboarding.modules.includes(m.key),
  ).map((m) => m.label);
  await sendOnboardingReadyEmail(
    organizationId,
    labels,
    quote.total,
    `${getSiteUrl()}/dashboard/billing`,
  );
  revalidatePath(pathFor(organizationId));
  revalidatePath("/platform-admin/onboarding");
  return { success: true };
}

// Takes a sent onboarding back so the modules can be changed.
export async function reopenOnboardingAction(
  organizationId: string,
): Promise<OnboardingResult> {
  await requirePlatformAdmin();
  const onboarding = await getOnboarding(organizationId);
  if (!onboarding || onboarding.status !== "awaiting_payment")
    return { error: "Only a sent onboarding can be reopened." };
  const { error } = await createAdminClient()
    .from("tenant_onboarding")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) return { error: "Couldn't reopen it. Please try again." };
  revalidatePath(pathFor(organizationId));
  revalidatePath("/platform-admin/onboarding");
  return { success: true };
}
