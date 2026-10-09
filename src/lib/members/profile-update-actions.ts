"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateProposedChanges } from "@/lib/members/profile-update-requests";
import type { MemberProposedChanges, MemberProfileUpdateRequestStatus } from "@/types/database";

const MEMBERS_PATH = "/dashboard/members";

// Plain FormData actions, same convention as approveMember/deleteMember
// in actions.ts (PendingRequestCard) — a fire-and-forget form post that
// relies on revalidatePath to reflect the result, not useActionState.
//
// Reviewing is admin-only (not just "members" tab write access) — matches
// member_profile_update_requests' own RLS update policy (is_org_admin,
// migration 0123), stricter than the "write" tab-permission bar most
// other members actions use, since this changes another person's
// identity data on their behalf.
async function reviewRequest(requestId: string, decision: Exclude<MemberProfileUpdateRequestStatus, "pending">): Promise<void> {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return;

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("member_profile_update_requests")
    .select("id, organization_id, member_id, proposed_changes, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!request || request.organization_id !== membership.organization.id || request.status !== "pending") {
    return;
  }

  if (decision === "approved") {
    const { data: member } = await admin.from("members").select("*").eq("id", request.member_id).maybeSingle();
    if (!member) return;

    // Defense in depth — the submit route already validated this, but a
    // request can sit pending for a while, so re-check against whatever
    // the member's row looks like NOW before writing it, rather than
    // trusting a check that ran when the request was first submitted.
    const validationError = validateProposedChanges(member, request.proposed_changes as MemberProposedChanges);
    if (validationError) return;

    await admin.from("members").update(request.proposed_changes as MemberProposedChanges).eq("id", member.id);
  }

  await admin
    .from("member_profile_update_requests")
    .update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", requestId);

  revalidatePath(MEMBERS_PATH);
}

export async function approveMemberProfileUpdateRequest(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return;
  await reviewRequest(requestId, "approved");
}

export async function rejectMemberProfileUpdateRequest(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return;
  await reviewRequest(requestId, "rejected");
}
