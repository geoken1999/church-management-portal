import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getAllDeletionRequests } from "@/lib/account-deletion/dal";
import { DeletionRequestsList } from "@/components/account-deletion/DeletionRequestsList";

export const metadata: Metadata = {
  title: "Deletion Requests | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

export default async function PlatformAdminDeletionRequestsPage() {
  await requirePlatformAdmin();
  const requests = await getAllDeletionRequests();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Account deletion requests</h1>
        <p className="mt-1 text-muted-foreground">
          People who asked to delete their account from the mobile app. A church&apos;s owners and admins process their members&apos; and team&apos;s requests; a church owner&apos;s own request can
          only be processed here. A church&apos;s only owner can&apos;t be deleted until ownership is transferred or the church is closed.
        </p>
      </div>
      <DeletionRequestsList requests={requests} emptyText="No account deletion requests." />
    </div>
  );
}
