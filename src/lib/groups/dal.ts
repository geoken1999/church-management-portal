import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { GroupKey } from "@/lib/groups/shares";

export async function getGroupPosts(organizationId: string, groupKey: GroupKey) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("group_posts")
    .select("id, title, body, link_url, created_at")
    .eq("organization_id", organizationId)
    .eq("group_key", groupKey)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}
