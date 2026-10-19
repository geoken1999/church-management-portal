import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface PrayerMember {
  userId: string;
  memberId: string;
  organizationId: string;
}

// The active member behind a request's bearer token, or null. The person is always worked out from the
// session, never from anything the request body says.
export async function prayerMemberFromRequest(
  request: Request,
): Promise<PrayerMember | null> {
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
    .select("id, organization_id, status")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!member || member.status !== "active") return null;
  return {
    userId: userData.user.id,
    memberId: member.id,
    organizationId: member.organization_id,
  };
}
