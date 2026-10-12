import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/client";

// A short push to one member (if they use the app), e.g. "your details were
// updated". Best-effort and never throws.
export async function notifyMember(memberId: string, title: string, body: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: member } = await admin.from("members").select("auth_user_id").eq("id", memberId).maybeSingle();
    if (!member?.auth_user_id) return;
    await sendPushToUsers([member.auth_user_id], "church_announcement", { title, body, data: { type: "member_update" } });
  } catch (error) {
    console.error("notifyMember failed", error);
  }
}
