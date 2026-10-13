"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkTabAccess } from "@/lib/permissions/dal";
import { checkStorageQuota } from "@/lib/plans/dal";
import { FLYER_BUCKET, FLYER_TYPES, flyerProblem } from "@/lib/events/flyer";

export interface FlyerResult {
  error?: string;
  path?: string;
}

async function eventOrg(eventId: string): Promise<{ organization_id: string; flyer_path: string | null } | null> {
  const { data } = await createAdminClient().from("events").select("organization_id, flyer_path").eq("id", eventId).maybeSingle();
  return data;
}

// Sets or replaces an event's flyer. The old file is removed once the new one is saved.
export async function uploadEventFlyerAction(formData: FormData): Promise<FlyerResult> {
  await requireUser();
  const eventId = String(formData.get("eventId") ?? "");
  const event = await eventOrg(eventId);
  if (!event) return { error: "That event could not be found." };
  const access = await checkTabAccess(event.organization_id, "events", "write");
  if (!access.ok) return { error: access.message };

  const file = formData.get("flyer");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  const problem = flyerProblem(file);
  if (problem) return { error: problem };
  const quotaError = await checkStorageQuota(event.organization_id, file.size);
  if (quotaError) return { error: quotaError };

  const admin = createAdminClient();
  // A new name each time, so a changed flyer is never shown from a cache.
  const path = `${event.organization_id}/${eventId}/${crypto.randomUUID()}.${FLYER_TYPES[file.type]}`;
  const { error: uploadError } = await admin.storage.from(FLYER_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { error: "Couldn't upload that flyer. Please try again." };

  const { error } = await admin.from("events").update({ flyer_path: path }).eq("id", eventId);
  if (error) {
    await admin.storage.from(FLYER_BUCKET).remove([path]);
    return { error: "Uploaded the flyer, but couldn't save it. Please try again." };
  }
  if (event.flyer_path) await admin.storage.from(FLYER_BUCKET).remove([event.flyer_path]);
  revalidatePath("/dashboard/events");
  return { path };
}

export async function removeEventFlyerAction(eventId: string): Promise<FlyerResult> {
  await requireUser();
  const event = await eventOrg(eventId);
  if (!event) return { error: "That event could not be found." };
  const access = await checkTabAccess(event.organization_id, "events", "write");
  if (!access.ok) return { error: access.message };

  const admin = createAdminClient();
  await admin.from("events").update({ flyer_path: null }).eq("id", eventId);
  if (event.flyer_path) await admin.storage.from(FLYER_BUCKET).remove([event.flyer_path]);
  revalidatePath("/dashboard/events");
  return {};
}
