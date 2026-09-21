import { removeMember } from "@/lib/organizations/actions";
import { normalizeTabPermissions } from "@/lib/permissions/tabs";
import type { TabPermissions } from "@/types/database";
import { Button } from "@/components/ui/button";
import { MemberPermissionsButton } from "@/components/organizations/MemberPermissionsButton";

interface Member {
  id: string;
  role: string;
  title: string | null;
  auth_user_id: string;
  tab_permissions: TabPermissions | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
}

export function MembersList({
  members,
  organizationId,
  currentUserId,
  canManage,
}: {
  members: Member[];
  organizationId: string;
  currentUserId: string;
  canManage: boolean;
}) {
  return (
    <ul className="divide-y divide-border">
      {members.map((member) => {
        const name = member.profiles
          ? `${member.profiles.first_name} ${member.profiles.last_name}`.trim()
          : "Unknown";
        const isSelf = member.auth_user_id === currentUserId;

        return (
          <li key={member.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium">
                {name} {isSelf && <span className="text-muted-foreground">(you)</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {member.profiles?.email}
                {member.title && ` · ${member.title}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium capitalize text-muted-foreground">{member.role}</span>
              {canManage && member.role === "member" && (
                <MemberPermissionsButton
                  organizationId={organizationId}
                  memberId={member.id}
                  memberName={name}
                  initialPermissions={normalizeTabPermissions(member.tab_permissions)}
                />
              )}
              {canManage && !isSelf && member.role !== "owner" && (
                <form action={removeMember}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    Remove
                  </Button>
                </form>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
