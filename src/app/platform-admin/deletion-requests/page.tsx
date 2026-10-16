import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getAllDeletionRequests } from "@/lib/account-deletion/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { WebDeletionRequests } from "@/components/account-deletion/WebDeletionRequests";
import { DeletionRequestsList } from "@/components/account-deletion/DeletionRequestsList";

export const metadata: Metadata = {
  title: "Deletion Requests | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

export default async function PlatformAdminDeletionRequestsPage() {
  await requirePlatformAdmin();
  const requests = await getAllDeletionRequests();
  const { data: formRows } = await createAdminClient()
    .from("deletion_form_requests")
    .select("id, name, email, phone, church_name, relationship, scope, details, status, verified_at, processed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const webRequests = (formRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    churchName: r.church_name,
    relationship: r.relationship,
    scope: r.scope,
    details: r.details,
    status: r.status as "unverified" | "pending" | "completed" | "rejected",
    verifiedAt: r.verified_at,
    processedAt: r.processed_at,
    createdAt: r.created_at,
  }));

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

      <div className="space-y-2 pt-4">
        <h2 className="font-heading text-xl font-bold tracking-tight">From the web form</h2>
        <p className="text-sm text-muted-foreground">People who can&apos;t use the app and asked at /delete-account. Each has confirmed their email.</p>
        <WebDeletionRequests requests={webRequests} unconfirmed={webRequests.filter((r) => r.status === "unverified").length} />
      </div>
    </div>
  );
}
