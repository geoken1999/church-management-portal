import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { VerificationStatus } from "@/lib/members/proof";

export interface ProofMember {
  userId: string;
  memberId: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  selfRegistered: boolean;
  status: VerificationStatus;
  startedAt: string | null;
  note: string | null;
}

// The member behind a request's bearer token, in any status (a person waiting for approval has to be able to
// upload their proof), or null. The person always comes from the session, never from the request body.
export async function proofMemberFromRequest(
  request: Request,
): Promise<ProofMember | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
  if (!token) return null;
  const admin = createAdminClient();
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user) return null;
  const { data: member } = await admin
    .from("members")
    .select(
      "id, organization_id, first_name, last_name, self_registered, verification_status, verification_started_at, verification_note",
    )
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!member) return null;
  return {
    userId: userData.user.id,
    memberId: member.id,
    organizationId: member.organization_id,
    firstName: member.first_name,
    lastName: member.last_name,
    selfRegistered: member.self_registered,
    status: member.verification_status as VerificationStatus,
    startedAt: member.verification_started_at,
    note: member.verification_note,
  };
}
