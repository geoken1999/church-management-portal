import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DeletionRequestView } from "@/components/account-deletion/DeletionRequestsList";

function toView(row: {
  id: string;
  requester_kind: DeletionRequestView["kind"];
  display_name: string;
  contact: string | null;
  reason: string | null;
  requested_at: string;
  status: DeletionRequestView["status"];
  outcome: string | null;
  processed_at: string | null;
}, churchName?: string | null): DeletionRequestView {
  return {
    id: row.id,
    kind: row.requester_kind,
    name: row.display_name,
    contact: row.contact,
    reason: row.reason,
    requestedAt: row.requested_at,
    churchName,
    status: row.status,
    outcome: row.outcome,
    processedAt: row.processed_at,
  };
}

// A church's own requests (members and team; its owner's are for a platform
// admin). Read with the signed-in admin's own access.
export async function getChurchDeletionRequests(organizationId: string): Promise<DeletionRequestView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_deletion_requests")
    .select("id, requester_kind, display_name, contact, reason, requested_at, status, outcome, processed_at")
    .eq("organization_id", organizationId)
    .neq("requester_kind", "owner")
    .order("requested_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((row) => toView(row));
}

// Every church's requests, for the Super Admin page (church owners' ones
// first, since only a platform admin can process those).
export async function getAllDeletionRequests(): Promise<DeletionRequestView[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("account_deletion_requests")
    .select("id, requester_kind, display_name, contact, reason, requested_at, status, outcome, processed_at, organizations(name)")
    .order("requested_at", { ascending: false })
    .limit(200);
  const views = (data ?? []).map((row) => toView(row, (row.organizations as { name: string } | null)?.name ?? null));
  return views.sort((a, b) => Number(b.kind === "owner") - Number(a.kind === "owner"));
}
