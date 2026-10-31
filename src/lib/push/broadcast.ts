import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isGroupKey } from "@/lib/groups/shares";
import { sendPushToUsers } from "@/lib/push/client";
import { isPushConfigured } from "@/lib/push/env";
import { resolveAudienceAuthIds, type PushAudience } from "@/lib/push/audience";
import { validatePushAction } from "@/lib/push/link";

export interface BroadcastResult {
  error?: string;
  success?: boolean;
  sent?: number;
}

export interface BroadcastInput {
  organizationId: string;
  userId: string;
  audienceType: string;
  groupKey?: string;
  memberId?: string;
  branchId?: string;
  title: string;
  body: string;
  linkUrl?: string;
  buttonLabel?: string;
}

export interface PreparedBroadcast {
  title: string;
  body: string;
  linkUrl: string | null;
  buttonLabel: string | null;
  audience: PushAudience;
}

// Checks a broadcast's wording, link and audience, and that a chosen member or branch belongs to the church.
// Used both when sending now and when scheduling, so a scheduled one can't be saved with something that would fail.
export async function prepareBroadcast(input: BroadcastInput): Promise<PreparedBroadcast | { error: string }> {
  const cleanTitle = input.title.trim();
  const cleanBody = input.body.trim();
  if (cleanTitle.length < 2 || cleanTitle.length > 60) return { error: "Title must be 2 to 60 characters." };
  if (cleanBody.length < 2 || cleanBody.length > 240) return { error: "Message must be 2 to 240 characters." };

  const action = validatePushAction({ linkUrl: input.linkUrl ?? "", buttonLabel: input.buttonLabel ?? "" });
  if ("error" in action) return { error: action.error };

  let audience: PushAudience;
  if (input.audienceType === "church") audience = { type: "church" };
  else if (input.audienceType === "branch" && input.branchId) audience = { type: "branch", branchId: input.branchId };
  else if (input.audienceType === "group" && isGroupKey(input.groupKey)) audience = { type: "group", groupKey: input.groupKey };
  else if (input.audienceType === "member" && input.memberId) audience = { type: "member", memberId: input.memberId };
  else return { error: "Choose who should get this." };

  const admin = createAdminClient();
  if (audience.type === "member") {
    const { data: member } = await admin.from("members").select("id").eq("id", audience.memberId).eq("organization_id", input.organizationId).maybeSingle();
    if (!member) return { error: "That member could not be found." };
  }
  if (audience.type === "branch") {
    const { data: branch } = await admin.from("branches").select("id").eq("id", audience.branchId).eq("organization_id", input.organizationId).maybeSingle();
    if (!branch) return { error: "That branch could not be found." };
  }
  return { title: cleanTitle, body: cleanBody, linkUrl: action.linkUrl, buttonLabel: action.buttonLabel, audience };
}

// Sends a push notification to the whole church, one branch, one group or one
// member, and records it in the history. The caller has already checked that
// [userId] is an owner/admin of [organizationId].
export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const prepared = await prepareBroadcast(input);
  if ("error" in prepared) return { error: prepared.error };
  const { title: cleanTitle, body: cleanBody, audience } = prepared;
  const action = { linkUrl: prepared.linkUrl, buttonLabel: prepared.buttonLabel };

  if (!isPushConfigured()) return { error: "Push notifications aren't set up on this server yet." };

  const admin = createAdminClient();

  const recipients = await resolveAudienceAuthIds(input.organizationId, audience);
  if (recipients.length === 0) return { error: "Nobody in that audience has the mobile app yet." };

  const result = await sendPushToUsers(recipients, "church_announcement", {
    title: cleanTitle,
    body: cleanBody,
    data: {
      type: "church_announcement",
      ...(action.linkUrl ? { link: action.linkUrl } : {}),
      ...(action.buttonLabel ? { buttonLabel: action.buttonLabel } : {}),
    },
  });
  if (result.delivered === 0) {
    if (result.skipped === "no_devices") return { error: "Those members haven't allowed notifications on a device yet." };
    if (result.skipped === "opted_out") return { error: "Those members have turned notifications off." };
    return { error: `The notification could not be delivered${result.error ? `: ${result.error}` : "."}` };
  }

  await admin.from("push_broadcasts").insert({
    organization_id: input.organizationId,
    audience: audience.type,
    group_key: audience.type === "group" ? audience.groupKey : null,
    member_id: audience.type === "member" ? audience.memberId : null,
    branch_id: audience.type === "branch" ? audience.branchId : null,
    title: cleanTitle,
    body: cleanBody,
    link_url: action.linkUrl,
    button_label: action.buttonLabel,
    recipient_count: result.delivered,
    created_by: input.userId,
  });

  return { success: true, sent: result.delivered };
}
