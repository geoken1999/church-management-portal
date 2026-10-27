import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
// Generic despite the folder it lives in — the same "match a messy phone
// string against every org's members, last-10-digits" rule the WhatsApp
// inbound webhook already uses (see routing.ts there) to resolve which
// org a phone number belongs to.
import { isSameNumber, nationalTail } from "@/lib/whatsapp/phone-match";

export interface MemberOrgMatch {
  memberId: string;
  organizationId: string;
  organizationName: string;
  firstName: string;
  lastName: string;
  /** "student" for someone from outside the church who takes Bible School courses; else "member". */
  kind: "member" | "student";
}

// Shared by both mobile member-auth routes — check-phone calls this before
// an OTP is ever sent (so a non-member's number doesn't rack up SMS cost
// or get handed a working session), and complete calls it again
// afterward, against the OTP-verified phone from the Supabase session
// itself rather than trusting client input a second time.
//
// Returns every org whose active member list contains this number — the
// caller decides what "more than one" means (an ambiguous match is
// refused the same way routing.ts refuses one, rather than guessing which
// church this signs the person into).
export async function matchMemberOrgsByPhone(
  phone: string,
): Promise<MemberOrgMatch[]> {
  const tail = nationalTail(phone);
  if (tail.length !== 10) return [];

  const admin = createAdminClient();
  const { data: candidates } = await admin
    .from("members")
    .select(
      "id, organization_id, phone, first_name, last_name, status, self_registered, organizations(name)",
    )
    .like("phone", `%${tail}`)
    // A person who joined through the church's public form can open the app while waiting for approval; they send
    // a proof document there (migration 0224). Anyone else still pending is not let in.
    .or("status.in.(active,student),and(status.eq.pending,self_registered.eq.true)");

  const matches = (candidates ?? []).filter(
    (m) => m.phone && isSameNumber(m.phone, phone),
  );

  return matches.map((m) => ({
    memberId: m.id,
    organizationId: m.organization_id,
    organizationName: (m.organizations as { name: string } | null)?.name ?? "",
    firstName: m.first_name,
    lastName: m.last_name,
    kind: m.status === "student" ? "student" : "member",
  }));
}
