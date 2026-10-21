import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { requireUser } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembers } from "@/lib/members/dal";
import { loadGroup } from "@/lib/group-chat/service";
import { loadParticipants } from "@/lib/group-chat/actions";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { GroupView } from "@/components/group-chat/GroupView";

export const metadata: Metadata = { title: "Group | KingdomFlow" };
export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const membership = await requireOrganization();
  const user = await requireUser();
  const organizationId = membership.organization.id;
  const access = membership.tabAccess.groups;
  if (!access.read) return <AccessRestricted label="Groups" />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const group = await loadGroup(id, organizationId);
  if (!group || group.archived_at) notFound();

  const admin = createAdminClient();
  const [participants, members, { data: team }] = await Promise.all([
    loadParticipants(organizationId, id),
    getMembers(organizationId),
    admin
      .from("organization_members")
      .select("auth_user_id")
      .eq("organization_id", organizationId),
  ]);
  const teamIds = (team ?? []).map((t) => t.auth_user_id);
  const { data: profiles } = teamIds.length
    ? await admin
        .from("profiles")
        .select("auth_user_id, first_name, last_name")
        .in("auth_user_id", teamIds)
    : { data: [] };

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/groups"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All groups
      </Link>
      <GroupView
        organizationId={organizationId}
        group={{
          id: group.id,
          name: group.name,
          description: group.description,
        }}
        participants={participants}
        members={members
          .filter((m) => m.status === "active")
          .map((m) => ({
            id: m.id,
            name: `${m.first_name} ${m.last_name}`.trim(),
            phone: m.phone,
          }))}
        team={(profiles ?? []).map((p) => ({
          authUserId: p.auth_user_id,
          name: `${p.first_name} ${p.last_name}`.trim(),
        }))}
        canWrite={access.write}
        canDelete={access.delete}
        selfAuthUserId={user.id}
      />
    </div>
  );
}
