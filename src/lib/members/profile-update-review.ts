import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { validateProposedChanges } from "@/lib/members/profile-update-requests";
import type { MemberProposedChanges } from "@/types/database";

// Approves or rejects a member's profile change request. Shared by the web
// dashboard's form actions and the staff mobile app's API route. The caller
// has already checked that [reviewerId] is an owner/admin of [organizationId].
export async function reviewProfileUpdateRequest(input: {
  requestId: string;
  organizationId: string;
  reviewerId: string;
  decision: "approved" | "rejected";
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("member_profile_update_requests")
    .select("id, organization_id, member_id, proposed_changes, status")
    .eq("id", input.requestId)
    .maybeSingle();

  if (!request || request.organization_id !== input.organizationId) return { ok: false, error: "That request could not be found." };
  if (request.status !== "pending") return { ok: false, error: "That request has already been reviewed." };

  if (input.decision === "approved") {
    const { data: member } = await admin.from("members").select("*").eq("id", request.member_id).maybeSingle();
    if (!member) return { ok: false, error: "That member could not be found." };

    // A request can sit pending for a while, so re-check it against the
    // member's row as it is NOW before writing it.
    const validationError = validateProposedChanges(member, request.proposed_changes as MemberProposedChanges);
    if (validationError) return { ok: false, error: validationError };

    const { error } = await admin.from("members").update(request.proposed_changes as MemberProposedChanges).eq("id", member.id);
    if (error) return { ok: false, error: "Couldn't apply those changes." };
  }

  await admin
    .from("member_profile_update_requests")
    .update({ status: input.decision, reviewed_by: input.reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", input.requestId);

  return { ok: true };
}
