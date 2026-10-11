import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MemberGroup } from "@/components/members/MemberGroups";

// The people groups a campaign can be aimed at, besides branch: the
// members who are leaders, youth, on the worship or media team, or on the
// committee. Each is a roster of member ids kept by its own module; a group
// with nobody in it is left out so the filter only offers real choices.
const GROUP_SOURCES = [
  { key: "leaders", label: "Leaders", table: "leaders" },
  { key: "youth", label: "Youth", table: "youths" },
  { key: "worship", label: "Worship team", table: "worship_team_members" },
  { key: "media", label: "Media team", table: "media_team_members" },
  { key: "committee", label: "Committee", table: "committee_members" },
] as const;

export async function getMemberGroups(organizationId: string): Promise<MemberGroup[]> {
  const supabase = await createClient();
  const results = await Promise.all(
    GROUP_SOURCES.map(async (source) => {
      const { data } = await supabase.from(source.table).select("member_id").eq("organization_id", organizationId);
      const memberIds = [...new Set((data ?? []).map((row) => row.member_id as string))];
      return { key: source.key, label: source.label, memberIds };
    }),
  );
  return results.filter((group) => group.memberIds.length > 0);
}
