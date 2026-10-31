"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_TOTAL_ATTACHMENT_BYTES } from "@/lib/email/validation";
import { formatInTimezone } from "@/lib/organizations/timezone";
import { parseScheduleTime, summarize } from "@/lib/scheduler/validation";
import { prepareBroadcast } from "@/lib/push/broadcast";
import { isRepeat, type Repeat } from "@/lib/scheduler/recurrence";
import { partsInTimezone, zonedTimeToUtc } from "@/lib/organizations/timezone";
import type { ScheduledAttachment, ScheduledCampaignChannel } from "@/types/database";

const PAGES: Record<ScheduledCampaignChannel, string> = { email: "/dashboard/email", sms: "/dashboard/sms", whatsapp: "/dashboard/whatsapp", push: "/dashboard/mobile/notifications" };
const BUCKET = "scheduled-campaign-files";

export interface ScheduleState {
  error?: string;
  success?: boolean;
  // When it will go out, written in the church's own time.
  scheduledLabel?: string;
  // Not used when scheduling; they let a composer treat sending and scheduling results alike.
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
}

function readRecipients(formData: FormData): unknown[] | null {
  try {
    const parsed = JSON.parse(String(formData.get("recipients") ?? "[]"));
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

// Saves a campaign to be sent later. It takes the same fields as sending now (subject and html,
// or body, or template and values, plus recipients), with the channel and the chosen time added.
// Nothing is sent now; the checks that depend on the moment of sending (the plan's allowance,
// WhatsApp's limits) are made when it goes out.
export async function scheduleCampaignAction(formData: FormData): Promise<ScheduleState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const channel = String(formData.get("channel") ?? "") as ScheduledCampaignChannel;
  if (channel !== "email" && channel !== "sms" && channel !== "whatsapp") return { error: "Choose what to schedule." };
  if (!membership.tabAccess[channel].write) return { error: `You don't have permission to send ${channel === "sms" ? "SMS" : channel === "email" ? "email" : "WhatsApp messages"}.` };

  const when = parseScheduleTime(String(formData.get("scheduledAt") ?? ""), membership.organization.timezone);
  if ("error" in when) return { error: when.error };

  const recipients = readRecipients(formData);
  if (!recipients) return { error: "Select at least one recipient." };

  const admin = createAdminClient();
  let payload: Record<string, unknown>;
  let summary: string;
  const attachments: ScheduledAttachment[] = [];

  if (channel === "email") {
    const subject = String(formData.get("subject") ?? "").trim();
    const html = String(formData.get("html") ?? "");
    if (!subject) return { error: "Add a subject." };
    if (!html.replace(/<[^>]*>/g, "").trim()) return { error: "Write a message before scheduling." };
    payload = { subject, html, recipients };
    summary = summarize("email", subject);

    const files = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length > MAX_ATTACHMENTS) return { error: `You can attach at most ${MAX_ATTACHMENTS} files.` };
    let total = 0;
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) return { error: `"${file.name}" is larger than 5MB.` };
      total += file.size;
    }
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) return { error: "Attachments are too large combined. Keep the total under 20MB." };
    const folder = crypto.randomUUID();
    for (const file of files) {
      const path = `${organizationId}/${folder}/${crypto.randomUUID()}`;
      const { error } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (error) {
        if (attachments.length > 0) await admin.storage.from(BUCKET).remove(attachments.map((a) => a.path));
        return { error: "Couldn't save an attachment. Please try again." };
      }
      attachments.push({ path, filename: file.name, contentType: file.type || null, size: file.size });
    }
  } else if (channel === "sms") {
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return { error: "Write a message before scheduling." };
    payload = { body, recipients };
    summary = summarize("sms", body);
  } else {
    const templateId = String(formData.get("templateId") ?? "");
    if (!templateId) return { error: "Select a message template." };
    const { data: template } = await admin.from("whatsapp_templates").select("name, status").eq("id", templateId).eq("organization_id", organizationId).maybeSingle();
    if (!template) return { error: "That template could not be found." };
    if (template.status !== "approved") return { error: "This template hasn't been approved by WhatsApp yet." };
    let specsInput: unknown;
    try {
      specsInput = JSON.parse(String(formData.get("placeholderSpecs") ?? "[]"));
    } catch {
      return { error: "Couldn't read the template's fill-in values." };
    }
    payload = { templateId, specsInput, recipients };
    summary = summarize("whatsapp", template.name);
  }

  const { error } = await admin.from("scheduled_campaigns").insert({
    organization_id: organizationId,
    channel,
    scheduled_at: when.at.toISOString(),
    payload,
    attachments,
    summary,
    recipient_count: recipients.length,
    created_by: user.id,
  });
  if (error) {
    if (attachments.length > 0) await admin.storage.from(BUCKET).remove(attachments.map((a) => a.path));
    return { error: "Couldn't schedule that. Please try again." };
  }
  revalidatePath(PAGES[channel]);
  const scheduledLabel = formatInTimezone(when.at.toISOString(), membership.organization.timezone, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }, "en-IN");
  return { success: true, scheduledLabel };
}

// Takes a campaign off the schedule, if it hasn't started going out.
export async function cancelScheduledCampaignAction(id: string): Promise<{ error?: string }> {
  await requireUser();
  const membership = await requireOrganization();
  const admin = createAdminClient();
  const { data: row } = await admin.from("scheduled_campaigns").select("channel, attachments, status").eq("id", id).eq("organization_id", membership.organization.id).maybeSingle();
  if (!row) return { error: "That campaign could not be found." };
  const allowed = row.channel === "push" ? membership.role === "owner" || membership.role === "admin" : membership.tabAccess[row.channel].write;
  if (!allowed) return { error: "You don't have permission to change this." };
  if (row.status !== "scheduled") return { error: row.status === "sending" ? "It is going out right now." : "It has already been dealt with." };

  // Only a still-scheduled one is cancelled, so a send that has just started isn't undone.
  const { data: cancelled } = await admin.from("scheduled_campaigns").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", id).eq("status", "scheduled").select("id").maybeSingle();
  if (!cancelled) return { error: "It is going out right now." };
  const files = (row.attachments as ScheduledAttachment[]).map((a) => a.path);
  if (files.length > 0) await admin.storage.from(BUCKET).remove(files);
  revalidatePath(PAGES[row.channel]);
  return {};
}

// Saves a push notification to be sent later. Owner/admin only, like sending one now. The audience is stored as
// chosen (the whole church, a branch, a group or a member) and worked out again when it goes out.
export async function schedulePushAction(input: {
  audienceType: string;
  groupKey?: string;
  memberId?: string;
  branchId?: string;
  title: string;
  body: string;
  linkUrl?: string;
  buttonLabel?: string;
  pin?: boolean;
  scheduledAt: string;
  repeat?: Repeat;
  /** The last day it may go out (a date, in the church's time zone). */
  repeatUntil?: string;
}): Promise<ScheduleState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only an owner or admin can schedule notifications." };
  const organizationId = membership.organization.id;

  const when = parseScheduleTime(input.scheduledAt, membership.organization.timezone);
  if ("error" in when) return { error: when.error };

  const prepared = await prepareBroadcast({ ...input, organizationId, userId: user.id });
  if ("error" in prepared) return { error: prepared.error };

  const repeat: Repeat = isRepeat(input.repeat) ? input.repeat : "none";
  let repeatUntil: Date | null = null;
  if (repeat !== "none" && input.repeatUntil) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.repeatUntil)) return { error: "Choose a valid end date." };
    repeatUntil = zonedTimeToUtc(`${input.repeatUntil}T23:59`, membership.organization.timezone);
    if (Number.isNaN(repeatUntil.getTime()) || repeatUntil.getTime() < when.at.getTime()) return { error: "The end date must be on or after the first send." };
    if (repeatUntil.getTime() > Date.now() + 2 * 366 * 86_400_000) return { error: "Choose an end date within the next two years." };
  }

  const { error } = await createAdminClient().from("scheduled_campaigns").insert({
    organization_id: organizationId,
    channel: "push",
    scheduled_at: when.at.toISOString(),
    payload: {
      audienceType: input.audienceType,
      groupKey: input.groupKey,
      memberId: input.memberId,
      branchId: input.branchId,
      title: prepared.title,
      body: prepared.body,
      linkUrl: prepared.linkUrl ?? undefined,
      buttonLabel: prepared.buttonLabel ?? undefined,
      pin: input.pin === true ? true : undefined,
      // Keeps a monthly message on the same day of the month after a short month.
      anchorDay: partsInTimezone(when.at, membership.organization.timezone).day,
    },
    repeat,
    repeat_until: repeatUntil ? repeatUntil.toISOString() : null,
    attachments: [],
    summary: summarize("sms", prepared.title),
    recipient_count: 0,
    created_by: user.id,
  });
  if (error) return { error: "Couldn't schedule that. Please try again." };
  revalidatePath(PAGES.push);
  const scheduledLabel = formatInTimezone(when.at.toISOString(), membership.organization.timezone, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }, "en-IN");
  return { success: true, scheduledLabel };
}
