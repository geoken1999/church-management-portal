"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGroupKey } from "@/lib/groups/shares";
import { sendPushToUsers } from "@/lib/push/client";
import { isPushConfigured } from "@/lib/push/env";
import { resolveAudienceAuthIds, type PushAudience } from "@/lib/push/audience";

export interface BroadcastResult {
  error?: string;
  success?: boolean;
  sent?: number;
}

// Sends a push notification to the whole church, one group, or one member.
// Owner/admin only (the whole Mobile App section is).
export async function sendBroadcastAction(audienceType: string, groupKey: string, memberId: string, title: string, body: string): Promise<BroadcastResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only an owner or admin can send notifications." };

  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (cleanTitle.length < 2 || cleanTitle.length > 60) return { error: "Title must be 2 to 60 characters." };
  if (cleanBody.length < 2 || cleanBody.length > 240) return { error: "Message must be 2 to 240 characters." };

  let audience: PushAudience;
  if (audienceType === "church") audience = { type: "church" };
  else if (audienceType === "group" && isGroupKey(groupKey)) audience = { type: "group", groupKey };
  else if (audienceType === "member" && memberId) audience = { type: "member", memberId };
  else return { error: "Choose who should get this." };

  if (!isPushConfigured()) return { error: "Push notifications aren't set up on this server yet." };

  const organizationId = membership.organization.id;
  const admin = createAdminClient();

  if (audience.type === "member") {
    const { data: member } = await admin.from("members").select("id").eq("id", audience.memberId).eq("organization_id", organizationId).maybeSingle();
    if (!member) return { error: "That member could not be found." };
  }

  const recipients = await resolveAudienceAuthIds(organizationId, audience);
  if (recipients.length === 0) return { error: "Nobody in that audience has the mobile app yet." };

  await sendPushToUsers(recipients, "church_announcement", {
    title: cleanTitle,
    body: cleanBody,
    data: { type: "church_announcement" },
  });

  await admin.from("push_broadcasts").insert({
    organization_id: organizationId,
    audience: audience.type,
    group_key: audience.type === "group" ? audience.groupKey : null,
    member_id: audience.type === "member" ? audience.memberId : null,
    title: cleanTitle,
    body: cleanBody,
    recipient_count: recipients.length,
    created_by: user.id,
  });

  revalidatePath("/dashboard/mobile/notifications");
  return { success: true, sent: recipients.length };
}
