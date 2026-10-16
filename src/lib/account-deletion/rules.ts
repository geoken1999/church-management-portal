// Who raises and who processes an account deletion request. Pure, so the
// API route, the web screens and the tests share it.
export type DeletionRequesterKind = "member" | "team" | "owner";
export type DeletionDecision =
  "delete_account" | "delete_account_and_record" | "reject";

// A church owner's own deletion can only be handled by a platform admin
// (the church may need transferring or closing first); everyone else's by
// their church's owner or admin.
export function processedBy(
  kind: DeletionRequesterKind,
): "church_admin" | "platform_admin" {
  return kind === "owner" ? "platform_admin" : "church_admin";
}

// What a processor may choose for a request of this kind.
export function allowedDecisions(
  kind: DeletionRequesterKind,
): DeletionDecision[] {
  if (kind === "member")
    return ["delete_account", "delete_account_and_record", "reject"];
  return ["delete_account", "reject"];
}

export function describeDecision(
  kind: DeletionRequesterKind,
  decision: DeletionDecision,
): string {
  if (decision === "reject") return "Decline the request. Nothing is deleted.";
  if (kind === "member") {
    return decision === "delete_account"
      ? "Delete their app account. They stay on your member list."
      : "Delete their app account and their member record (and what's linked to it).";
  }
  return "Remove them from your church and delete their account (if they belong to no other church).";
}

export const DELETION_POLICY_TEXT =
  "Your request is sent to your church's admin, who reviews and processes it. Until then your account stays active. Once it is processed, your sign-in is deleted and you will be signed out; your church may also remove your member record.";
