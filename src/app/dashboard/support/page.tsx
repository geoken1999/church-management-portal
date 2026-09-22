import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { getSupportTickets } from "@/lib/support/dal";
import { SupportManager } from "@/components/support/SupportManager";

export const metadata: Metadata = {
  title: "Support | KingdomFlow",
};

export default async function SupportPage() {
  const user = await requireUser();
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";

  const tickets = await getSupportTickets(membership.organization.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Support</h1>
        <p className="mt-1 text-muted-foreground">Raise a ticket if you run into a problem or have a question.</p>
      </div>

      <SupportManager
        organizationId={membership.organization.id}
        tickets={tickets}
        currentUserId={user.id}
        canManage={canManage}
      />
    </div>
  );
}
