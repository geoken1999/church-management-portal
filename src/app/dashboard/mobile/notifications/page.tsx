import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { createClient } from "@/lib/supabase/server";
import { PushBroadcastPanel, type BroadcastHistoryRow, type RecipientOption } from "@/components/mobile/PushBroadcastPanel";

export const metadata: Metadata = {
  title: "App Notifications | KingdomFlow",
};

export default async function AppNotificationsPage() {
  const membership = await requireOrganization();
  const supabase = await createClient();
  const organizationId = membership.organization.id;

  const [{ data: members }, { data: history }] = await Promise.all([
    supabase
      .from("members")
      .select("id, first_name, last_name")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .not("auth_user_id", "is", null)
      .order("first_name")
      .limit(1000),
    supabase.from("push_broadcasts").select("id, audience, group_key, title, body, recipient_count, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(20),
  ]);

  const recipients: RecipientOption[] = (members ?? []).map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name ?? ""}`.trim() }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">App notifications</h1>
        <p className="mt-1 text-muted-foreground">
          Send a push notification to members who use the mobile app: the whole church, one group, or one person. Group announcement boards, birthdays and
          anniversaries notify automatically.
        </p>
      </div>
      <PushBroadcastPanel recipients={recipients} history={(history ?? []) as BroadcastHistoryRow[]} />
    </div>
  );
}
