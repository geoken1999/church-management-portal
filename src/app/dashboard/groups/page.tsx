import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import {
  GroupsManager,
  type GroupListRow,
} from "@/components/group-chat/GroupsManager";

export const metadata: Metadata = { title: "Groups | KingdomFlow" };
export const dynamic = "force-dynamic";

// People → Groups: the church's chat groups. The team creates a group and adds people; they chat in the app.
export default async function GroupsPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const access = membership.tabAccess.groups;
  if (!access.read) return <AccessRestricted label="Groups" />;

  const admin = createAdminClient();
  const { data: groups } = await admin
    .from("church_groups")
    .select("id, name, description, created_at")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  const ids = (groups ?? []).map((g) => g.id);
  const [{ data: people }, { data: latest }] = await Promise.all([
    ids.length
      ? admin
          .from("church_group_members")
          .select("group_id")
          .in("group_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? admin
          .from("church_group_messages")
          .select("group_id, created_at")
          .in("group_id", ids)
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ]);
  const counts = new Map<string, number>();
  for (const p of people ?? [])
    counts.set(p.group_id, (counts.get(p.group_id) ?? 0) + 1);
  const lastAt = new Map<string, string>();
  for (const m of latest ?? [])
    if (!lastAt.has(m.group_id)) lastAt.set(m.group_id, m.created_at);

  const rows: GroupListRow[] = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    people: counts.get(g.id) ?? 0,
    lastMessageAt: lastAt.get(g.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Groups
        </h1>
        <p className="mt-1 text-muted-foreground">
          Chat groups for {membership.organization.name}. Add people to a group
          and they chat together in the KingdomFlow app, with notifications they
          control.
        </p>
      </div>
      <GroupsManager
        organizationId={organizationId}
        groups={rows}
        canWrite={access.write}
      />
    </div>
  );
}
