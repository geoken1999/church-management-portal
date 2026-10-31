import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { createClient } from "@/lib/supabase/server";
import { getScheduledCampaigns } from "@/lib/scheduler/dal";
import { resolveAudienceAuthIds } from "@/lib/push/audience";
import { GROUP_KEYS, type GroupKey } from "@/lib/groups/shares";
import { PushBroadcastPanel, type AudienceCounts, type BroadcastHistoryRow, type RecipientOption } from "@/components/mobile/PushBroadcastPanel";

export const metadata: Metadata = {
  title: "App Notifications | KingdomFlow",
};

export default async function AppNotificationsPage() {
  const membership = await requireOrganization();
  const supabase = await createClient();
  const organizationId = membership.organization.id;

  const [{ data: members }, { data: history }, { data: branches }] = await Promise.all([
    supabase
      .from("members")
      .select("id, first_name, last_name, phone")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .not("auth_user_id", "is", null)
      .order("first_name")
      .limit(1000),
    supabase.from("push_broadcasts").select("id, audience, group_key, title, body, recipient_count, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(20),
    supabase.from("branches").select("id, name").eq("organization_id", organizationId).order("name"),
  ]);

  const [church, groupCounts, branchCounts, scheduled] = await Promise.all([
    resolveAudienceAuthIds(organizationId, { type: "church" }),
    Promise.all(GROUP_KEYS.map(async (key) => [key, (await resolveAudienceAuthIds(organizationId, { type: "group", groupKey: key })).length] as const)),
    Promise.all((branches ?? []).map(async (b) => [b.id, (await resolveAudienceAuthIds(organizationId, { type: "branch", branchId: b.id })).length] as const)),
    getScheduledCampaigns(organizationId, "push"),
  ]);
  const counts: AudienceCounts = { church: church.length, groups: Object.fromEntries(groupCounts) as Record<GroupKey, number>, branches: Object.fromEntries(branchCounts) };

  const recipients: RecipientOption[] = (members ?? []).map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name ?? ""}`.trim(), phone: m.phone }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">App notifications</h1>
        <p className="mt-1 text-muted-foreground">
          Send a push notification to members who use the mobile app: the whole church, a branch, one group, or one person. Send it now or schedule it for later. Group announcement boards, birthdays and
          anniversaries notify automatically.
        </p>
      </div>
      <PushBroadcastPanel recipients={recipients} history={(history ?? []) as BroadcastHistoryRow[]} branches={branches ?? []} counts={counts} scheduled={scheduled} timezone={membership.organization.timezone} />
    </div>
  );
}
