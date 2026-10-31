"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { sendBroadcast, type BroadcastResult } from "@/lib/push/broadcast";

export type { BroadcastResult };

// Sends a push notification to the whole church, one branch, one group or one
// member. Owner/admin only (the whole Mobile App section is).
export async function sendBroadcastAction(
  audienceType: string,
  groupKey: string,
  memberId: string,
  title: string,
  body: string,
  branchId = "",
  linkUrl = "",
  buttonLabel = "",
  pin = false,
): Promise<BroadcastResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only an owner or admin can send notifications." };

  const result = await sendBroadcast({ organizationId: membership.organization.id, userId: user.id, audienceType, groupKey, memberId, branchId, title, body, linkUrl, buttonLabel, pin });
  if (result.success) revalidatePath("/dashboard/mobile/notifications");
  return result;
}
