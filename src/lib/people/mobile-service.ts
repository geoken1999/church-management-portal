import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgFeatureState } from "@/lib/plans/dal";
import { validateLeader } from "@/lib/leaders/validation";
import { validateYouth } from "@/lib/youth/validation";
import { validateFamily, validateFamilyMember } from "@/lib/families/validation";
import { validateCommitteeMember } from "@/lib/committee/validation";
import { parseVolunteerStatus, validateVolunteer } from "@/lib/volunteers/validation";

// The staff mobile app's Leaders, Youth and Families changes. The same rules as
// the web's server actions (src/lib/{leaders,youth,families}/actions.ts), for a
// bearer-token caller: who may do it was checked by the route. Each of those
// tables is admin-only to write under RLS by default, so the writes use the
// service role, and every id is first checked to belong to this church.

export type PeopleResult = { ok: true; id?: string } | { ok: false; error: string };

const fail = (error: string): PeopleResult => ({ ok: false, error });

async function memberBelongs(organizationId: string, memberId: string): Promise<boolean> {
  if (!memberId) return false;
  const admin = createAdminClient();
  const { data } = await admin.from("members").select("id").eq("id", memberId).eq("organization_id", organizationId).maybeSingle();
  return Boolean(data);
}

async function underCap(organizationId: string, tab: "leaders" | "youth" | "families" | "committee", table: string): Promise<string | null> {
  const { featureCaps } = await getOrgFeatureState(organizationId);
  const cap = featureCaps[tab] ?? null;
  if (cap === null) return null;
  const admin = createAdminClient();
  const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  return (count ?? 0) >= cap ? `This church's plan allows up to ${cap} ${tab} entries. Remove one or contact us to raise the limit.` : null;
}

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const orNull = (value: string) => value || null;

// --- Leaders -----------------------------------------------------------------

export async function createLeaderForMobile(organizationId: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const memberId = clean(f.memberId);
  const errors = validateLeader({ memberId });
  if (errors.memberId) return fail(errors.memberId);
  if (!(await memberBelongs(organizationId, memberId))) return fail("That member could not be found.");
  const capError = await underCap(organizationId, "leaders", "leaders");
  if (capError) return fail(capError);

  const admin = createAdminClient();
  const { error } = await admin.from("leaders").insert({ organization_id: organizationId, member_id: memberId, title: orNull(clean(f.title)), notes: orNull(clean(f.notes)) });
  if (error) return fail(error.code === "23505" ? "That member is already a leader." : "Couldn't add that leader. Please try again.");
  return { ok: true };
}

export async function updateLeaderForMobile(organizationId: string, id: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("leaders").update({ title: orNull(clean(f.title)), notes: orNull(clean(f.notes)) }).eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't save those changes. Please try again.") : { ok: true };
}

export async function deleteLeaderForMobile(organizationId: string, id: string): Promise<PeopleResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("leaders").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't remove that leader.") : { ok: true };
}

// --- Youth -------------------------------------------------------------------

export async function createYouthForMobile(organizationId: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const memberId = clean(f.memberId);
  const errors = validateYouth({ memberId });
  if (errors.memberId) return fail(errors.memberId);
  if (!(await memberBelongs(organizationId, memberId))) return fail("That member could not be found.");
  const capError = await underCap(organizationId, "youth", "youths");
  if (capError) return fail(capError);

  const admin = createAdminClient();
  const { error } = await admin.from("youths").insert({
    organization_id: organizationId,
    member_id: memberId,
    grade: orNull(clean(f.grade)),
    guardian_name: orNull(clean(f.guardianName)),
    guardian_phone: orNull(clean(f.guardianPhone)),
    notes: orNull(clean(f.notes)),
  });
  if (error) return fail(error.code === "23505" ? "That member is already in the youth roster." : "Couldn't add that youth. Please try again.");
  return { ok: true };
}

export async function updateYouthForMobile(organizationId: string, id: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("youths")
    .update({ grade: orNull(clean(f.grade)), guardian_name: orNull(clean(f.guardianName)), guardian_phone: orNull(clean(f.guardianPhone)), notes: orNull(clean(f.notes)) })
    .eq("id", id)
    .eq("organization_id", organizationId);
  return error ? fail("Couldn't save those changes. Please try again.") : { ok: true };
}

export async function deleteYouthForMobile(organizationId: string, id: string): Promise<PeopleResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("youths").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't remove that youth.") : { ok: true };
}

// --- Families ----------------------------------------------------------------

export async function createFamilyForMobile(organizationId: string, userId: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const name = clean(f.name);
  const errors = validateFamily({ name });
  if (errors.name) return fail(errors.name);
  const capError = await underCap(organizationId, "families", "families");
  if (capError) return fail(capError);

  const admin = createAdminClient();
  const { data, error } = await admin.from("families").insert({ organization_id: organizationId, name, notes: orNull(clean(f.notes)), created_by: userId }).select("id").single();
  return error || !data ? fail("Couldn't create that family. Please try again.") : { ok: true, id: data.id };
}

export async function updateFamilyForMobile(organizationId: string, id: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const name = clean(f.name);
  const errors = validateFamily({ name });
  if (errors.name) return fail(errors.name);
  const admin = createAdminClient();
  const { error } = await admin.from("families").update({ name, notes: orNull(clean(f.notes)) }).eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't save those changes. Please try again.") : { ok: true };
}

// Removes the family and every member's place in it, not the members themselves.
export async function deleteFamilyForMobile(organizationId: string, id: string): Promise<PeopleResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("families").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't delete that family.") : { ok: true };
}

export async function addFamilyMemberForMobile(organizationId: string, familyId: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const memberId = clean(f.memberId);
  const relationship = clean(f.relationship);
  const errors = validateFamilyMember({ memberId, relationship });
  const firstError = errors.memberId ?? errors.relationship;
  if (firstError) return fail(firstError);
  if (!(await memberBelongs(organizationId, memberId))) return fail("That member could not be found.");

  const admin = createAdminClient();
  const { data: family } = await admin.from("families").select("id").eq("id", familyId).eq("organization_id", organizationId).maybeSingle();
  if (!family) return fail("That family could not be found.");

  const { error } = await admin.from("family_members").insert({ family_id: familyId, organization_id: organizationId, member_id: memberId, relationship, notes: orNull(clean(f.notes)) });
  if (error) return fail(error.message.toLowerCase().includes("duplicate") ? "That member is already part of this family." : "Couldn't add that family member. Please try again.");
  return { ok: true };
}

export async function updateFamilyMemberForMobile(organizationId: string, id: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const relationship = clean(f.relationship);
  if (relationship.length < 2) return fail("Relationship must be at least 2 characters.");
  const admin = createAdminClient();
  const { error } = await admin.from("family_members").update({ relationship, notes: orNull(clean(f.notes)) }).eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't save those changes. Please try again.") : { ok: true };
}

export async function removeFamilyMemberForMobile(organizationId: string, id: string): Promise<PeopleResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("family_members").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't remove that family member.") : { ok: true };
}

// --- Committee ---------------------------------------------------------------

export async function createCommitteeForMobile(organizationId: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const memberId = clean(f.memberId);
  const committeeName = clean(f.committeeName);
  const role = clean(f.role);
  const errors = validateCommitteeMember({ memberId, committeeName, role });
  const firstError = errors.memberId ?? errors.committeeName ?? errors.role;
  if (firstError) return fail(firstError);
  if (!(await memberBelongs(organizationId, memberId))) return fail("That member could not be found.");
  const capError = await underCap(organizationId, "committee", "committee_members");
  if (capError) return fail(capError);

  const admin = createAdminClient();
  const { error } = await admin
    .from("committee_members")
    .insert({ organization_id: organizationId, member_id: memberId, committee_name: committeeName, role, notes: orNull(clean(f.notes)) });
  return error ? fail("Couldn't add that committee member. Please try again.") : { ok: true };
}

// The person stays the same; their committee, role and notes can change.
export async function updateCommitteeForMobile(organizationId: string, id: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const committeeName = clean(f.committeeName);
  const role = clean(f.role);
  const errors = validateCommitteeMember({ memberId: "x", committeeName, role });
  const firstError = errors.committeeName ?? errors.role;
  if (firstError) return fail(firstError);

  const admin = createAdminClient();
  const { error } = await admin
    .from("committee_members")
    .update({ committee_name: committeeName, role, notes: orNull(clean(f.notes)) })
    .eq("id", id)
    .eq("organization_id", organizationId);
  return error ? fail("Couldn't save those changes. Please try again.") : { ok: true };
}

export async function deleteCommitteeForMobile(organizationId: string, id: string): Promise<PeopleResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("committee_members").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't remove that committee member.") : { ok: true };
}

// --- Volunteers --------------------------------------------------------------

export async function createVolunteerForMobile(organizationId: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const memberId = clean(f.memberId);
  const input = { memberId, role: clean(f.role), team: clean(f.team), joinedOn: clean(f.joinedOn), status: clean(f.status) };
  const errors = validateVolunteer(input);
  const firstError = errors.memberId ?? errors.role ?? errors.joinedOn;
  if (firstError) return fail(firstError);
  if (!(await memberBelongs(organizationId, memberId))) return fail("That member could not be found.");

  const admin = createAdminClient();
  const { error } = await admin.from("volunteers").insert({
    organization_id: organizationId,
    member_id: memberId,
    role: input.role,
    team: orNull(input.team),
    joined_on: input.joinedOn || undefined,
    status: parseVolunteerStatus(input.status),
    notes: orNull(clean(f.notes)),
  });
  if (error) return fail(error.code === "23505" ? "That member is already a volunteer." : "Couldn't add that volunteer. Please try again.");
  return { ok: true };
}

// The person stays the same; what they volunteer as, their team, status and notes can change.
export async function updateVolunteerForMobile(organizationId: string, id: string, f: Record<string, unknown>): Promise<PeopleResult> {
  const input = { memberId: "x", role: clean(f.role), team: clean(f.team), joinedOn: clean(f.joinedOn), status: clean(f.status) };
  const errors = validateVolunteer(input);
  const firstError = errors.role ?? errors.joinedOn;
  if (firstError) return fail(firstError);

  const admin = createAdminClient();
  const { error } = await admin
    .from("volunteers")
    .update({ role: input.role, team: orNull(input.team), joined_on: input.joinedOn || undefined, status: parseVolunteerStatus(input.status), notes: orNull(clean(f.notes)) })
    .eq("id", id)
    .eq("organization_id", organizationId);
  return error ? fail("Couldn't save those changes. Please try again.") : { ok: true };
}

export async function deleteVolunteerForMobile(organizationId: string, id: string): Promise<PeopleResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("volunteers").delete().eq("id", id).eq("organization_id", organizationId);
  return error ? fail("Couldn't remove that volunteer.") : { ok: true };
}
