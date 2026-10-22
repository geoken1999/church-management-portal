import "server-only";

import { checkFeatureCap } from "@/lib/plans/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMember } from "@/lib/push/member-notice";
import { createNotificationForWebhook } from "@/lib/notifications/create";
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

/** Member ids that are already in a family (a person can be in one family only). */
async function inAFamily(memberIds: string[]): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set();
  const { data } = await createAdminClient().from("family_members").select("member_id").in("member_id", memberIds);
  return new Set((data ?? []).map((r) => r.member_id));
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
  const taken = await inAFamily((data ?? []).map((m) => m.id));
  return {
    ok: true,
    people: (data ?? [])
      .filter((m) => !taken.has(m.id))
      .map((m) => ({ id: m.id, name: fullName(m), phone: maskPhone(m.phone) })),
  };
}

export type MyFamily = {
  id: string;
  name: string;
  notes: string | null;
  /** The caller asked for this family, so they can edit it. */
  isOwner: boolean;
  people: { memberId: string; name: string; relationship: string; isMe: boolean }[];
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
      admin.from("families").select("id, name, notes, owner_member_id").in("id", ids).order("name"),
      admin.from("family_members").select("family_id, member_id, relationship, members(first_name, last_name)").in("family_id", ids),
    ]);
    for (const family of rows ?? []) {
      families.push({
        id: family.id,
        name: family.name,
        notes: family.notes,
        isOwner: family.owner_member_id === me.id,
        people: (people ?? [])
          .filter((p) => p.family_id === family.id)
          .map((p) => ({
            memberId: p.member_id,
            name: p.members ? fullName(p.members) : "Member",
            relationship: p.relationship,
            isMe: p.member_id === me.id,
          })),
      });
    }
  }
  const { data: latest } = await admin
    .from("family_requests")
    .select("id, name, kind, status, review_note, created_at")
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
  if ((await inAFamily([me.id])).size > 0)
    return { ok: false, error: "You're already in a family. A person can be in one family only." };
  if (input.people.length > 0) {
    const taken = await inAFamily(input.people.map((p) => p.memberId));
    if (taken.size > 0) return { ok: false, error: "One of the people you picked is already in a family." };
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

  // The web bell, and a push to the owners' and admins' phones.
  await createNotificationForWebhook({
    organizationId: me.organization_id,
    type: "family_request",
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
  if (input.decision === "approved" && request.kind === "add") {
    const person = ((request.people as FamilyRequestPerson[]) ?? [])[0];
    const { data: family } = request.target_family_id
      ? await admin.from("families").select("id, name").eq("id", request.target_family_id).maybeSingle()
      : { data: null };
    if (!family || !person) return { ok: false, error: "That family or person no longer exists." };
    const { data: valid } = await admin
      .from("members")
      .select("id")
      .eq("id", person.member_id)
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .maybeSingle();
    if (!valid) return { ok: false, error: "That person is no longer an active member." };
    if ((await inAFamily([person.member_id])).size > 0) return { ok: false, error: "That person is already in a family." };
    const { error: addError } = await admin.from("family_members").insert({
      organization_id: input.organizationId,
      family_id: family.id,
      member_id: person.member_id,
      relationship: person.relationship,
    });
    if (addError) return { ok: false, error: "Couldn't add that person." };
    familyId = family.id;
    await notifyMember(person.member_id, "You were added to a family", `You are now in the "${family.name}" family.`);
  } else if (input.decision === "approved") {
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
    // One family per person: anyone who joined another family meanwhile is left out.
    const taken = await inAFamily([...ok]);
    if (taken.has(request.requested_by)) return { ok: false, error: "The member who asked is already in a family." };
    for (const id of taken) ok.delete(id);

    const { data: family, error: familyError } = await admin
      .from("families")
      .insert({
        organization_id: input.organizationId,
        name: request.name,
        notes: request.notes,
        created_by: input.reviewerId,
        owner_member_id: request.requested_by,
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

  const adding = request.kind === "add";
  await notifyMember(
    request.requested_by,
    input.decision === "approved"
      ? adding ? "Your family change was approved" : "Your family was approved"
      : adding ? "Your family change wasn't approved" : "Your family request wasn't approved",
    adding
      ? input.decision === "approved"
        ? `The person you added is now in the "${request.name}" family.`
        : `Your church didn't approve adding someone to the "${request.name}" family.`
      : input.decision === "approved"
        ? `The "${request.name}" family is now in your church's records.`
        : `Your church didn't approve the "${request.name}" family request.`,
  );
  return { ok: true };
}

// ---- The family's owner (and everyone else in it) managing it from the app ----

async function ownFamily(authUserId: string, familyId: string) {
  const me = await memberForAuthUser(authUserId);
  if (!me) return null;
  const admin = createAdminClient();
  const { data: family } = await admin
    .from("families")
    .select("id, organization_id, owner_member_id")
    .eq("id", familyId)
    .maybeSingle();
  if (!family || family.organization_id !== me.organization_id) return null;
  const { data: mine } = await admin
    .from("family_members")
    .select("id")
    .eq("family_id", familyId)
    .eq("member_id", me.id)
    .maybeSingle();
  if (!mine) return null;
  return { me, family, isOwner: family.owner_member_id === me.id };
}

const NOT_YOURS = "Only the person who created this family can change it.";

export async function renameMyFamily(authUserId: string, familyId: string, name: string, notes: string): Promise<Answer> {
  const ctx = await ownFamily(authUserId, familyId);
  if (!ctx) return { ok: false, error: "That family could not be found." };
  if (!ctx.isOwner) return { ok: false, error: NOT_YOURS };
  if (name.trim().length < 2) return { ok: false, error: "Give the family a name (at least 2 letters)." };
  const { error } = await createAdminClient()
    .from("families")
    .update({ name: name.trim(), notes: notes.trim() || null })
    .eq("id", familyId);
  return error ? { ok: false, error: "Couldn't save that. Please try again." } : { ok: true };
}

export async function addToMyFamily(authUserId: string, familyId: string, memberId: string, relationship: string): Promise<Answer> {
  const ctx = await ownFamily(authUserId, familyId);
  if (!ctx) return { ok: false, error: "That family could not be found." };
  if (!ctx.isOwner) return { ok: false, error: NOT_YOURS };
  if (relationship.trim().length < 2) return { ok: false, error: "Say what this person is in the family, for example Son." };
  const admin = createAdminClient();
  const { count } = await admin.from("family_members").select("id", { count: "exact", head: true }).eq("family_id", familyId);
  if ((count ?? 0) >= MAX_FAMILY_PEOPLE + 1) return { ok: false, error: `A family can have up to ${MAX_FAMILY_PEOPLE + 1} people.` };
  const { data: person } = await admin
    .from("members")
    .select("id")
    .eq("id", memberId)
    .eq("organization_id", ctx.me.organization_id)
    .eq("status", "active")
    .maybeSingle();
  if (!person) return { ok: false, error: "That person isn't a member of this church." };
  if ((await inAFamily([memberId])).size > 0) return { ok: false, error: "That person is already in a family." };

  const [{ data: mine }, name] = await Promise.all([
    admin.from("family_members").select("relationship").eq("family_id", familyId).eq("member_id", ctx.me.id).maybeSingle(),
    familyName(familyId),
  ]);
  // Goes to the church's admins first, like creating a family.
  const { error } = await admin.from("family_requests").insert({
    organization_id: ctx.me.organization_id,
    requested_by: ctx.me.id,
    kind: "add",
    target_family_id: familyId,
    name,
    requester_relationship: mine?.relationship ?? "Member",
    people: [{ member_id: memberId, relationship: relationship.trim() }],
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "You already have a request waiting for approval." };
    return { ok: false, error: "Couldn't send that request. Please try again." };
  }
  await createNotificationForWebhook({
    organizationId: ctx.me.organization_id,
    type: "family_request",
    title: "Family change to review",
    body: `${fullName(ctx.me)} asked to add someone to the "${name}" family.`,
    link: "/dashboard/families",
  });
  return { ok: true };
}

async function familyName(familyId: string): Promise<string> {
  const { data } = await createAdminClient().from("families").select("name").eq("id", familyId).maybeSingle();
  return data?.name ?? "";
}

/** The owner removes someone else; anyone else in the family can only remove themselves (leave). */
export async function removeFromMyFamily(authUserId: string, familyId: string, memberId: string): Promise<Answer> {
  const ctx = await ownFamily(authUserId, familyId);
  if (!ctx) return { ok: false, error: "That family could not be found." };
  const leaving = memberId === ctx.me.id;
  if (leaving && ctx.isOwner)
    return { ok: false, error: "You created this family, so you can't leave it. Ask your church admin if it needs to be removed." };
  if (!leaving && !ctx.isOwner) return { ok: false, error: NOT_YOURS };
  const { error } = await createAdminClient().from("family_members").delete().eq("family_id", familyId).eq("member_id", memberId);
  if (error) return { ok: false, error: "Couldn't do that. Please try again." };
  if (!leaving) await notifyMember(memberId, "You were removed from a family", `You are no longer in the "${await familyName(familyId)}" family.`);
  return { ok: true };
}
