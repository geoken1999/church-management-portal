"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { cleanDestination, QR_CODE_PATTERN, randomQrCode } from "@/lib/qr/links";
import { normalizeDesign } from "@/lib/qr/design";
import { getQrStats, type QrStats } from "@/lib/qr/dal";

const QR_PATH = "/dashboard/qr-codes";

export interface QrFormState {
  error?: string;
  success?: boolean;
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function readFields(formData: FormData) {
  const siteHost = new URL(getSiteUrl()).host;
  const url = (key: string, label: string): { value: string | null; error?: string } => {
    const raw = text(formData, key);
    if (!raw) return { value: null };
    const cleaned = cleanDestination(raw, siteHost);
    return cleaned ? { value: cleaned } : { value: null, error: `${label} must be a web address like https://example.com.` };
  };

  const name = text(formData, "name");
  const destination = url("destination_url", "The main link");
  const ios = url("ios_url", "The iPhone link");
  const android = url("android_url", "The Android link");
  const desktop = url("desktop_url", "The computer link");
  const expired = url("expired_url", "The link after it ends");
  const error =
    (!name && "Give the QR code a name.") ||
    (!destination.value && (destination.error ?? "Enter where the QR code should go.")) ||
    ios.error ||
    android.error ||
    desktop.error ||
    expired.error ||
    undefined;

  const expiresRaw = text(formData, "expires_at");
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
  let design: Record<string, unknown> = {};
  try {
    design = normalizeDesign(JSON.parse(String(formData.get("design") ?? "{}"))) as unknown as Record<string, unknown>;
  } catch {
    design = normalizeDesign({}) as unknown as Record<string, unknown>;
  }

  return {
    error: error || (expiresAt && Number.isNaN(expiresAt.getTime()) ? "That end date isn't valid." : undefined),
    values: {
      name: name.slice(0, 80),
      destination_url: destination.value ?? "",
      ios_url: ios.value,
      android_url: android.value,
      desktop_url: desktop.value,
      expired_url: expired.value,
      expires_at: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : null,
      status: text(formData, "status") === "paused" ? ("paused" as const) : ("active" as const),
      design,
    },
  };
}

export async function createQrCode(_prev: QrFormState, formData: FormData): Promise<QrFormState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (!membership.tabAccess.qrcodes.write) return { error: "You don't have permission to create QR codes." };

  const { error, values } = readFields(formData);
  if (error) return { error };

  const custom = text(formData, "code").toLowerCase();
  if (custom && !QR_CODE_PATTERN.test(custom)) {
    return { error: "The short link can use 3 to 40 letters, numbers, dashes and underscores." };
  }

  const supabase = await createClient();
  // A generated code is retried a few times on the rare collision; a typed one is the church's choice and just reports it.
  for (let attempt = 0; attempt < (custom ? 1 : 5); attempt++) {
    const { error: insertError } = await supabase
      .from("qr_codes")
      .insert({ organization_id: membership.organization.id, code: custom || randomQrCode(), created_by: user.id, ...values });
    if (!insertError) {
      revalidatePath(QR_PATH);
      return { success: true };
    }
    if (insertError.code !== "23505") return { error: "Couldn't create that QR code. Please try again." };
    if (custom) return { error: "That short link is already taken. Try another." };
  }
  return { error: "Couldn't create that QR code. Please try again." };
}

export async function updateQrCode(_prev: QrFormState, formData: FormData): Promise<QrFormState> {
  await requireUser();
  const membership = await requireOrganization();
  if (!membership.tabAccess.qrcodes.write) return { error: "You don't have permission to edit QR codes." };

  const id = text(formData, "id");
  const { error, values } = readFields(formData);
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("qr_codes")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", membership.organization.id);
  if (updateError) return { error: "Couldn't save those changes. Please try again." };

  revalidatePath(QR_PATH);
  return { success: true };
}

export async function deleteQrCode(formData: FormData): Promise<void> {
  await requireUser();
  const membership = await requireOrganization();
  if (!membership.tabAccess.qrcodes.delete) return;

  const supabase = await createClient();
  await supabase.from("qr_codes").delete().eq("id", text(formData, "id")).eq("organization_id", membership.organization.id);
  revalidatePath(QR_PATH);
}

export async function loadQrStats(qrCodeId: string): Promise<QrStats | null> {
  await requireUser();
  const membership = await requireOrganization();
  if (!membership.tabAccess.qrcodes.read) return null;
  return getQrStats(membership.organization.id, qrCodeId);
}
