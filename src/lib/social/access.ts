import "server-only";

import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TabKey } from "@/lib/permissions/tabs";

export type SocialPlatform = "instagram" | "youtube" | "facebook";

const TAB_FOR_PLATFORM: Record<SocialPlatform, TabKey> = {
  instagram: "instagram",
  youtube: "youtube",
  facebook: "facebook",
};

export type SocialAccessResult = { ok: true } | { ok: false; message: string };

// Viewing the dashboard, posting, replying, deleting content and switching
// the active account all go through this: "read" for viewing, "write" for
// everything that changes something. Connecting or disconnecting the
// account itself is a stricter, separate bar — see checkSocialManageAccess.
export async function checkSocialAccess(organizationId: string, platform: SocialPlatform, level: "read" | "write"): Promise<SocialAccessResult> {
  const access = await checkTabAccess(organizationId, TAB_FOR_PLATFORM[platform], level);
  if (!access.ok) return { ok: false, message: access.message };
  return { ok: true };
}

// Connecting a new account, disconnecting it, or approving a pending
// Facebook Page is owner/admin only. This is the same bar the connection
// tables' own row security already applies to anyone reading them through
// the user's own session — kept explicit here now that the server actions
// read those tables with the service role instead.
export async function checkSocialManageAccess(organizationId: string, authUserId: string): Promise<SocialAccessResult> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (data?.role !== "owner" && data?.role !== "admin") {
    return { ok: false, message: "Only an owner or admin can connect or disconnect this account." };
  }
  return { ok: true };
}
