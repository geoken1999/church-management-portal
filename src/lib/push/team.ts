import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTabPermissions, type TabKey } from "@/lib/permissions/tabs";
import { sendPushToUsers } from "@/lib/push/client";

// Alerts the church team: owners and admins, plus anyone whose permissions let
// them view [tab] (when given). Best-effort: it never throws, so a push
// problem can't fail the request that triggered it.
export async function pushToTeam(input: {
  organizationId: string;
  tab?: TabKey;
  title: string;
  body: string;
  link?: string;
  excludeAuthUserId?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: team } = await admin.from("organization_members").select("auth_user_id, role, tab_permissions").eq("organization_id", input.organizationId);
    const recipients = (team ?? [])
      .filter((row) => row.role === "owner" || row.role === "admin" || (input.tab ? normalizeTabPermissions(row.tab_permissions)[input.tab].read : false))
      .map((row) => row.auth_user_id)
      .filter((id) => id !== input.excludeAuthUserId);
    await sendPushToUsers(recipients, "team_alert", {
      title: input.title,
      body: input.body,
      data: { type: "team_alert", ...(input.link ? { link: input.link } : {}) },
    });
  } catch (error) {
    console.error("pushToTeam failed", error);
  }
}
