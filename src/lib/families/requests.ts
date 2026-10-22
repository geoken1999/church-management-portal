import "server-only";

import { checkFeatureCap } from "@/lib/plans/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMember } from "@/lib/push/member-notice";
import { pushToTeam } from "@/lib/push/team";
import type { FamilyRequestPerson } from "@/types/database";

// Members ask for a family from the mobile app; an owner or admin approves it. The member
// is always worked out from the session token, never from the request body.

export const MAX_FAMILY_PEOPLE = 15;

type Answer<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export async function memberForAuthUser(authUserId: string) {
  const { data } = await createAdminClient()
    .from("members")
    .select("id, organization_id, first_name, last_name, status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data ?? null;
}

const fullName = (m: { first_name: string; last_name: string | null }) =>
  `${m.first_name} ${m.last_name ?? ""}`.trim();

/** Everything but the last three digits hidden: enough to tell two people apart. */
function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length < 4 ? null : `••••••${digits.slice(-3)}`;
}

/** Other members of the caller's church whose name or number matches [query] (3+ characters). */
export async function searchMembersForFamily(
  authUserId: string,
  query: string,
): Promise<Answer<{ people: { id: string; name: string; phone: string | null }[] }>> {
  const me = await memberForAuthUser(authUserId);
  if (!me) return { ok: false, error: "No member account is linked to this session." };
  const q = query.trim().replace(/[%,()]/g, " ");
  if (q.length < 3) return { ok: true, people: [] };
  const { data } = await createAdminClient()
    .from("members")
    .select("id, first_name, last_name, phone")
    .eq("organization_id", me.organization_id)
    .eq("status", "active")
    .neq("id", me.id)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .order("first_name")
    .limit(15);
  return {
    ok: true,
    people: (data ?? []).map((m) => ({ id: m.id, name: fullName(m), phone: maskPhone(m.phone) })),
  };
}

export type MyFamily = {
  id: string;
  name: string;
  notes: string | null;
  people: { name: string; relationship: string; isMe: boolean }[];
};

/** The caller's families, and their latest request (so the app can show "waiting" or "not approved"). */
export async function myFamilies(authUserId: string) {
  const me = await memberForAuthUser(authUserId);
  if (!me) return { ok: false as const, error: "No member account is linked to this session." };
  const admin = createAdminClient();
  const { data: mine } = await admin.from("family_members").select("family_id").eq("member_id", me.id);
  const ids = (mine ?? []).map((r) => r.family_id);
  const families: MyFamily[] = [];
  if (ids.length > 0) {
    const [{ data: rows }, { data: people }] = await Promise.all([
      admin.from("families").select("id, name, notes").in("id", ids).order("name"),
      admin.from("family_members").select("family_id, member_id, relationship, members(first_name, last_name)").in("family_id", ids),
    ]);
    for (const family of rows ?? []) {
      families.push({
        id: family.id,
        name: family.name,
        notes: family.notes,
        people: (people ?? [])
          .filter((p) => p.family_id === family.id)
          .map((p) => ({
            name: p.members ? fullName(p.members) : "Member",
            relationship: p.relationship,
            isMe: p.member_id === me.id,
          })),
      });
    }
  }
  const { data: latest } = await admin
    .from("family_requests")
    .select("id, name, status, review_note, created_at")
    .eq("requested_by", me.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { ok: true as const, families, request: latest ?? null };
}

export function validateFamilyRequestInput(input: {
  name: string;
  requesterRelationship: string;
  people: { memberId: string; relationship: string }[];
}): string | null {
  if (input.name.trim().length < 2) return "Give the family a name (at least 2 letters).";
  if (input.requesterRelationship.trim().length < 2) return "Say what you are in this family, for example Father or Daughter.";
  if (input.people.length > MAX_FAMILY_PEOPLE) return `A family request can include up to ${MAX_FAMILY_PEOPLE} people.`;
  const seen = new Set<string>();
  for (const p of input.people) {
    if (!p.memberId || seen.has(p.memberId)) return "Each person can be added only once.";
    seen.add(p.memberId);
    if (p.relationship.trim().length < 2) return "Say how each person is related to you.";
  }
  return null;
}

export async function submitFamilyRequest(
  authUserId: string,
  input: { name: string; notes: string; requesterRelationship: string; people: { memberId: string; relationship: string }[] },
): Promise<Answer> {
  const me = await memberForAuthUser(authUserId);
  if (!me) return { ok: false, error: "No member account is linked to this session." };
  if (me.status !== "active") return { ok: false, error: "Your membership isn't active yet." };
  const invalid = validateFamilyRequestInput(input);
  if (invalid) return { ok: false, error: invalid };

  const admin = createAdminClient();
  if (input.people.length > 0) {
    const { data: found } = await admin
      .from("members")
      .select("id")
      .eq("organization_id", me.organization_id)
      .eq("status", "active")
      .in("id", input.people.map((p) => p.memberId));
    if ((found ?? []).length !== input.people.length || input.people.some((p) => p.memberId === me.id))
      return { ok: false, error: "One of the people you picked isn't a member of this church." };
  }

  const { error } = await admin.from("family_requests").insert({
    organization_id: me.organization_id,
    requested_by: me.id,
    name: input.name.trim(),
    notes: input.notes.trim() || null,
    requester_relationship: input.requesterRelationship.trim(),
    people: input.people.map((p) => ({ member_id: p.memberId, relationship: p.relationship.trim() })),
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "You already have a family request waiting for approval." };
    console.error("family_requests insert failed:", error.message);
    return { ok: false, error: "Couldn't send that request. Please try again." };
  }

  await pushToTeam({
    organizationId: me.organization_id,
    tab: "families",
    title: "Family request to review",
    body: `${fullName(me)} asked to create the "${input.name.trim()}" family.`,
    link: "/dashboard/families",
  });
  return { ok: true };
}

/** Approves (creates the family and its people) or rejects a request. The caller is already known to be an owner/admin. */
export async function reviewFamilyRequest(input: {
  requestId: string;
  organizationId: string;
  reviewerId: string;
  decision: "approved" | "rejected";
  note?: string;
}): Promise<Answer> {
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("family_requests")
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();
  if (!request || request.organization_id !== input.organizationId)
    return { ok: false, error: "That request could not be found." };
  if (request.status !== "pending") return { ok: false, error: "That request has already been reviewed." };

  let familyId: string | null = null;
  if (input.decision === "approved") {
    const capError = await checkFeatureCap(input.organizationId, "families", "families");
    if (capError) return { ok: false, error: capError };

    // The people may have left or changed since the request was made: only active ones go in.
    const wanted = [
      { member_id: request.requested_by, relationship: request.requester_relationship },
      ...((request.people as FamilyRequestPerson[]) ?? []),
    ];
    const { data: valid } = await admin
      .from("members")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .in("id", wanted.map((p) => p.member_id));
    const ok = new Set((valid ?? []).map((m) => m.id));
    if (!ok.has(request.requested_by)) return { ok: false, error: "The member who asked is no longer active." };

    const { data: family, error: familyError } = await admin
      .from("families")
      .insert({
        organization_id: input.organizationId,
        name: request.name,
        notes: request.notes,
        created_by: input.reviewerId,
      })
      .select("id")
      .single();
    if (familyError || !family) return { ok: false, error: "Couldn't create that family." };
    familyId = family.id;

    const { error: peopleError } = await admin.from("family_members").insert(
      wanted
        .filter((p) => ok.has(p.member_id))
        .map((p) => ({
          organization_id: input.organizationId,
          family_id: family.id,
          member_id: p.member_id,
          relationship: p.relationship,
        })),
    );
    if (peopleError) {
      await admin.from("families").delete().eq("id", family.id);
      return { ok: false, error: "Couldn't add the people to that family." };
    }
  }

  await admin
    .from("family_requests")
    .update({
      status: input.decision,
      family_id: familyId,
      reviewed_by: input.reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: input.note?.trim() || null,
    })
    .eq("id", input.requestId);

  await notifyMember(
    request.requested_by,
    input.decision === "approved" ? "Your family was approved" : "Your family request wasn't approved",
    input.decision === "approved"
      ? `The "${request.name}" family is now in your church's records.`
      : `Your church didn't approve the "${request.name}" family request.`,
  );
  return { ok: true };
}
