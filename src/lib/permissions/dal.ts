import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { normalizeTabPermissions, fullTabAccess, type TabKey } from "@/lib/permissions/tabs";
import type { TabAccess } from "@/types/database";

export type TabAccessLevel = keyof TabAccess;

const LEVEL_VERB: Record<TabAccessLevel, string> = {
  read: "view",
  write: "edit",
  delete: "delete",
};

export type TabAccessResult = { ok: true; userId: string } | { ok: false; message: string };

// Enforced independently of any "active organization" concept, since
// mutating server actions in this codebase take organizationId from the
// submitted form rather than trusting a session-derived value — so
// permission has to be checked against that exact organization/user pair.
export async function checkTabAccess(
  organizationId: string,
  tab: TabKey,
  level: TabAccessLevel,
): Promise<TabAccessResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("organization_members")
    .select("role, tab_permissions")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data) {
    return { ok: false, message: "You don't have access to this organization." };
  }

  const access = data.role === "owner" || data.role === "admin" ? fullTabAccess() : normalizeTabPermissions(data.tab_permissions)[tab];

  if (!access[level]) {
    return { ok: false, message: `You don't have permission to ${LEVEL_VERB[level]} this.` };
  }

  return { ok: true, userId: user.id };
}
