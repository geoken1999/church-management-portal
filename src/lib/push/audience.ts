import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { GroupKey } from "@/lib/groups/shares";

export type PushAudience = { type: "church" } | { type: "group"; groupKey: GroupKey } | { type: "member"; memberId: string };

// Each group's membership table; all link to members by member_id.
const GROUP_TABLES: Record<GroupKey, "leaders" | "youths" | "worship_team_members" | "media_team_members" | "committee_members"> = {
  leaders: "leaders",
  youth: "youths",
  worship: "worship_team_members",
  media: "media_team_members",
  committee: "committee_members",
};

// The app accounts (auth user ids) an audience resolves to: only active
// members who have signed in to the mobile app (members.auth_user_id).
export async function resolveAudienceAuthIds(organizationId: string, audience: PushAudience): Promise<string[]> {
  const admin = createAdminClient();

  let memberIds: string[] | null = null;
  if (audience.type === "member") {
    memberIds = [audience.memberId];
  } else if (audience.type === "group") {
    const { data } = await admin.from(GROUP_TABLES[audience.groupKey]).select("member_id").eq("organization_id", organizationId);
    memberIds = (data ?? []).map((row) => row.member_id).filter((id): id is string => Boolean(id));
    if (memberIds.length === 0) return [];
  }

  let query = admin.from("members").select("auth_user_id").eq("organization_id", organizationId).eq("status", "active").not("auth_user_id", "is", null);
  if (memberIds) query = query.in("id", memberIds);
  const { data: members } = await query;
  return Array.from(new Set((members ?? []).map((m) => m.auth_user_id).filter((id): id is string => Boolean(id))));
}
