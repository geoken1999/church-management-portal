// No "server-only" guard — pure functions, safe to unit-test directly and
// to import from both the mobile-facing submit route and the admin
// review action, so the two ends of this workflow can never validate
// against different rules.

import type { Member, MemberProposedChanges } from "@/types/database";

// The only fields a member is ever allowed to propose — email and phone
// are deliberately excluded. phone especially is the member's own login
// identity (members.auth_user_id, migration 0120), not just a contact
// field a profile edit should be able to touch.
export const PROFILE_UPDATE_FIELDS = ["first_name", "last_name", "date_of_birth", "marital_status", "wedding_date"] as const;
export type ProfileUpdateField = (typeof PROFILE_UPDATE_FIELDS)[number];

export function isProfileUpdateField(key: string): key is ProfileUpdateField {
  return (PROFILE_UPDATE_FIELDS as readonly string[]).includes(key);
}

// Rejects anything outside PROFILE_UPDATE_FIELDS up front — the caller
// should show this as a hard error (a well-behaved client never sends
// these), not a per-field validation message.
export function rejectDisallowedFields(changes: Record<string, unknown>): string | null {
  const disallowed = Object.keys(changes).filter((key) => !isProfileUpdateField(key));
  if (disallowed.length > 0) {
    return `These fields can't be changed this way: ${disallowed.join(", ")}.`;
  }
  return null;
}

// Mirrors the date rules submit_member_request (migration 0024) enforces
// for the public join form — this workflow writes to the same columns via
// a plain UPDATE (approveMemberProfileUpdateRequest), which that RPC-only
// trigger-less check doesn't cover, so the same rules are re-implemented
// here rather than assumed to be enforced for free by the database.
// Validated against the MERGED result (current row + proposed changes),
// since e.g. a wedding_date on its own is only valid relative to whatever
// date_of_birth and marital_status end up being.
export function validateProposedChanges(current: Member, changes: MemberProposedChanges): string | null {
  const disallowed = rejectDisallowedFields(changes);
  if (disallowed) return disallowed;

  if ("first_name" in changes && (!changes.first_name || changes.first_name.trim().length < 1)) {
    return "First name is required.";
  }
  if ("last_name" in changes && (!changes.last_name || changes.last_name.trim().length < 1)) {
    return "Last name is required.";
  }

  const dateOfBirth = "date_of_birth" in changes ? changes.date_of_birth : current.date_of_birth;
  const maritalStatus = "marital_status" in changes ? changes.marital_status : current.marital_status;
  const weddingDate = "wedding_date" in changes ? changes.wedding_date : current.wedding_date;
  const today = new Date().toISOString().slice(0, 10);

  if (dateOfBirth && dateOfBirth > today) {
    return "Date of birth cannot be in the future.";
  }

  if (maritalStatus !== null && maritalStatus !== undefined && maritalStatus !== "married" && maritalStatus !== "unmarried") {
    return "Please select a valid marital status.";
  }

  if (maritalStatus === "married") {
    if (!weddingDate) {
      return "Wedding date is required when marital status is Married.";
    }
    if (weddingDate > today) {
      return "Wedding date cannot be in the future.";
    }
    if (dateOfBirth && weddingDate < dateOfBirth) {
      return "Wedding date cannot be before the date of birth.";
    }
  } else if (maritalStatus === "unmarried" && weddingDate) {
    return "Wedding date should be empty when marital status is Unmarried.";
  }

  return null;
}
