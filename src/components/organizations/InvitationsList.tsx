import { revokeInvitation } from "@/lib/organizations/actions";
import { Button } from "@/components/ui/button";

interface Invitation {
  id: string;
  email: string;
  role: string;
}

export function InvitationsList({ invitations }: { invitations: Invitation[] }) {
  if (invitations.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Pending invitations</p>
      <ul className="divide-y divide-border">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex items-center justify-between gap-4 py-2">
            <span className="text-sm">{invitation.email}</span>
            <form action={revokeInvitation}>
              <input type="hidden" name="invitationId" value={invitation.id} />
              <Button type="submit" size="sm" variant="ghost">
                Revoke
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
