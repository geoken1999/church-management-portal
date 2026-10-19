"use server";

import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRAYER_AUDIO_BUCKET } from "@/lib/prayer/audio";

// A short-lived link for the church team to play a request's voice message. Needs read access to the
// Prayer tab, and the request must belong to the team's own church.
export async function getPrayerAudioLinkAction(
  requestId: string,
): Promise<{ url?: string; error?: string }> {
  const membership = await requireOrganization();
  if (!membership.tabAccess.prayer.read)
    return { error: "You don't have access to prayer requests." };
  if (!/^[0-9a-f-]{36}$/i.test(requestId))
    return { error: "That recording could not be found." };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("prayer_requests")
    .select("audio_path")
    .eq("id", requestId)
    .eq("organization_id", membership.organization.id)
    .maybeSingle();
  if (!row?.audio_path) return { error: "That recording could not be found." };
  const { data, error } = await admin.storage
    .from(PRAYER_AUDIO_BUCKET)
    .createSignedUrl(row.audio_path, 300);
  if (error || !data) return { error: "Couldn't open that recording." };
  return { url: data.signedUrl };
}
