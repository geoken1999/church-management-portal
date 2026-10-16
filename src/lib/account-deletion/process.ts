import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import {
  allowedDecisions,
  processedBy,
  type DeletionDecision,
} from "@/lib/account-deletion/rules";

export interface Processor {
  authUserId: string;
  email: string | null;
  isPlatformAdmin: boolean;
}

// Carries out an admin's decision on one deletion request: decline it, or
// delete the account. Checks, in order, that the person is allowed to (a
// platform admin for a church owner's request, a church owner/admin for
// anyone else's, never their own), then does the deletion, then records what
// happened on the request.
export async function processDeletionRequest(input: {
  requestId: string;
  decision: DeletionDecision;
  note?: string;
  processor: Processor;
}): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("account_deletion_requests")
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();
  if (!request) return { error: "That request could not be found." };
  if (request.status !== "pending")
    return { error: "That request has already been processed." };
  if (request.auth_user_id === input.processor.authUserId)
    return { error: "You can't process your own deletion request." };
  if (!allowedDecisions(request.requester_kind).includes(input.decision))
    return { error: "That choice isn't available for this request." };

  const processor = input.processor;
  if (!processor.isPlatformAdmin) {
    if (processedBy(request.requester_kind) === "platform_admin")
      return {
        error: "Only a platform admin can process a church owner's request.",
      };
    const { data: role } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", request.organization_id ?? "")
      .eq("auth_user_id", processor.authUserId)
      .maybeSingle();
    if (role?.role !== "owner" && role?.role !== "admin")
      return {
        error:
          "Only an owner or admin of this church can process this request.",
      };
  }

  const finish = async (status: "completed" | "rejected", outcome: string) => {
    await admin
      .from("account_deletion_requests")
      .update({
        status,
        outcome,
        processed_note: input.note?.trim().slice(0, 500) || null,
        processed_by: processor.authUserId,
        processed_at: new Date().toISOString(),
      })
      .eq("id", request.id);
    await logPlatformEvent({
      level: "warning",
      source: "platform_admin",
      message: `Account deletion request ${status === "rejected" ? "declined" : "processed"} (${outcome}) by ${processor.email ?? processor.authUserId}`,
      organizationId: request.organization_id,
      metadata: { requestId: request.id, kind: request.requester_kind },
    });
  };

  if (input.decision === "reject") {
    await finish("rejected", "declined");
    return {};
  }

  // ---- delete ----
  const userId = request.auth_user_id;

  if (request.requester_kind === "member") {
    if (input.decision === "delete_account_and_record" && request.member_id) {
      const { error } = await admin
        .from("members")
        .delete()
        .eq("id", request.member_id);
      if (error)
        return {
          error: "Couldn't delete the member record. Nothing else was changed.",
        };
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message))
      return { error: "Couldn't delete the account. Please try again." };
    await finish(
      "completed",
      input.decision === "delete_account_and_record"
        ? "account_and_member_deleted"
        : "account_deleted",
    );
    return {};
  }

  // A team member or owner. Never leave a church without an owner.
  const { data: memberships } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("auth_user_id", userId);
  const owned = (memberships ?? [])
    .filter((m) => m.role === "owner")
    .map((m) => m.organization_id);
  for (const organizationId of owned) {
    const { count } = await admin
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return {
        error:
          "This person is the only owner of a church. Transfer ownership or close that church first, then process the request.",
      };
    }
  }

  // A church admin removes them from that church; a platform admin removes
  // them from every church. The login itself goes only once they belong to
  // none.
  const removeFrom = processor.isPlatformAdmin
    ? (memberships ?? []).map((m) => m.organization_id)
    : request.organization_id
      ? [request.organization_id]
      : [];
  if (removeFrom.length > 0) {
    const { error } = await admin
      .from("organization_members")
      .delete()
      .eq("auth_user_id", userId)
      .in("organization_id", removeFrom);
    if (error)
      return {
        error: "Couldn't remove them from the church. Please try again.",
      };
  }
  const { count: remaining } = await admin
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("auth_user_id", userId);
  if ((remaining ?? 0) === 0) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message))
      return {
        error:
          "Removed them from the church, but couldn't delete the account. Please try again.",
      };
    await finish("completed", "account_deleted");
  } else {
    await finish("completed", "removed_from_church");
  }
  return {};
}
