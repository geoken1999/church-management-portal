"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { isPlatformAdminEmail } from "@/lib/platform-admin/auth-helpers";
import { processDeletionRequest } from "@/lib/account-deletion/process";
import type { DeletionDecision } from "@/lib/account-deletion/rules";

export interface ProcessResult {
  error?: string;
  success?: boolean;
}

// An owner/admin (or a platform admin) deciding on one deletion request.
export async function processAccountDeletionAction(
  requestId: string,
  decision: DeletionDecision,
  note: string,
): Promise<ProcessResult> {
  const user = await requireUser();
  if (
    !["delete_account", "delete_account_and_record", "reject"].includes(
      decision,
    )
  )
    return { error: "That choice isn't valid." };

  const result = await processDeletionRequest({
    requestId,
    decision,
    note,
    processor: {
      authUserId: user.id,
      email: user.email ?? null,
      isPlatformAdmin: isPlatformAdminEmail(user.email),
    },
  });
  if (result.error) return result;

  revalidatePath("/dashboard/members");
  revalidatePath("/platform-admin/deletion-requests");
  return { success: true };
}
