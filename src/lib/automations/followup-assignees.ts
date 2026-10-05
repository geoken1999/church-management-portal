import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTabPermissions } from "@/lib/permissions/tabs";
import type { OrganizationRole, TabPermissions } from "@/types/database";

export interface FollowupAssignee {
  authUserId: string;
  name: string;
}

// Who may receive follow-up tasks: owners and admins, plus staff whose
// To Do permission includes write. The same rule is applied when an
// assignee is saved, so the list shown in the wizard and the check on the
// server can't drift apart.
export function canReceiveFollowupTasks(role: OrganizationRole, tabPermissions: TabPermissions | null): boolean {
  if (role === "owner" || role === "admin") return true;
  return normalizeTabPermissions(tabPermissions).todos.write;
}

export async function getFollowupAssignees(organizationId: string): Promise<FollowupAssignee[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_members")
    .select("auth_user_id, role, tab_permissions, profiles!inner(first_name, last_name)")
    .eq("organization_id", organizationId);

  return (data ?? [])
    .filter((m) => canReceiveFollowupTasks(m.role as OrganizationRole, m.tab_permissions as TabPermissions | null))
    .map((m) => {
      const profile = m.profiles as unknown as { first_name: string; last_name: string };
      return { authUserId: m.auth_user_id, name: `${profile.first_name} ${profile.last_name}`.trim() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
