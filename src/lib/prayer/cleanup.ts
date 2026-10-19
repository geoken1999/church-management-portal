import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PRAYER_AUDIO_BUCKET } from "@/lib/prayer/audio";

// Deleting a member row also deletes their prayer requests (database cascade), but the voice message files
// live in storage and would be left behind. Call this just before deleting members so their recordings go
// with them. Best effort: a storage hiccup never blocks the deletion itself.
export async function removePrayerAudioForMembers(memberIds: string[]): Promise<number> {
  if (memberIds.length === 0) return 0;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("prayer_requests")
      .select("audio_path")
      .in("member_id", memberIds)
      .not("audio_path", "is", null);
    const paths = (data ?? []).map((r) => r.audio_path).filter((p): p is string => Boolean(p));
    for (let i = 0; i < paths.length; i += 100) {
      await admin.storage.from(PRAYER_AUDIO_BUCKET).remove(paths.slice(i, i + 100));
    }
    return paths.length;
  } catch {
    return 0;
  }
}
