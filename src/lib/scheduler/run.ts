import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailCampaign } from "@/lib/email/send";
import { sendSmsCampaign } from "@/lib/sms/send";
import { sendWhatsAppCampaign } from "@/lib/whatsapp/send-campaign";
import { sendPushToUsers } from "@/lib/push/client";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { normalizeTabPermissions } from "@/lib/permissions/tabs";
import { STUCK_SENDING_MINUTES } from "@/lib/scheduler/validation";
import type { EmailAttachment } from "@/lib/email/client";
import type { ScheduledAttachment, ScheduledCampaign, TabPermissions } from "@/types/database";

type Admin = ReturnType<typeof createAdminClient>;
const BUCKET = "scheduled-campaign-files";
// A run handles this many at a time, so one slow batch can't hold the next run up.
const BATCH = 10;

export interface ScheduledRunResult {
  due: number;
  sent: number;
  failed: number;
  stuck: number;
}

// Whether the person who scheduled it may still send on that channel (they might have left or lost access).
async function stillAllowed(admin: Admin, organizationId: string, userId: string | null, channel: ScheduledCampaign["channel"]): Promise<boolean> {
  if (!userId) return false;
  const { data } = await admin.from("organization_members").select("role, tab_permissions").eq("organization_id", organizationId).eq("auth_user_id", userId).maybeSingle();
  if (!data) return false;
  if (data.role === "owner" || data.role === "admin") return true;
  return normalizeTabPermissions(data.tab_permissions as TabPermissions | null)[channel].write;
}

async function send(admin: Admin, row: ScheduledCampaign): Promise<{ ok: boolean; sentCount?: number; failedCount?: number; skippedCount?: number; error?: string }> {
  const userId = row.created_by as string;
  const recipients = row.payload.recipients;
  if (row.channel === "email") {
    const [{ data: org }, { data: profile }] = await Promise.all([
      admin.from("organizations").select("name").eq("id", row.organization_id).maybeSingle(),
      admin.from("profiles").select("email").eq("auth_user_id", userId).maybeSingle(),
    ]);
    const attachments: EmailAttachment[] = [];
    for (const file of row.attachments as ScheduledAttachment[]) {
      const { data } = await admin.storage.from(BUCKET).download(file.path);
      if (data) attachments.push({ filename: file.filename, content: Buffer.from(await data.arrayBuffer()), contentType: file.contentType ?? undefined });
    }
    const result = await sendEmailCampaign({
      organizationId: row.organization_id,
      organizationName: org?.name ?? "Your church",
      userId,
      userEmail: profile?.email ?? null,
      subject: String(row.payload.subject ?? ""),
      html: String(row.payload.html ?? ""),
      rawRecipients: recipients,
      attachments,
    });
    return { ok: !result.error, sentCount: result.sentCount, failedCount: result.failedCount, error: result.error };
  }
  if (row.channel === "sms") {
    const result = await sendSmsCampaign({ organizationId: row.organization_id, userId, body: String(row.payload.body ?? ""), rawRecipients: recipients });
    return { ok: !result.error, sentCount: result.sentCount, failedCount: result.failedCount, error: result.error };
  }
  const result = await sendWhatsAppCampaign({ organizationId: row.organization_id, userId, templateId: String(row.payload.templateId ?? ""), specsInput: row.payload.specsInput, rawRecipients: recipients });
  return { ok: !result.error, sentCount: result.sentCount, failedCount: result.failedCount, skippedCount: result.skippedCount, error: result.error };
}

const CHANNEL_NAMES = { email: "email", sms: "SMS", whatsapp: "WhatsApp message" } as const;

// Sends every scheduled campaign that has come due. Safe to run again and again: a campaign
// is claimed (marked sending) before it goes out, so two overlapping runs never send it twice.
export async function runDueCampaigns(admin: Admin, now: Date = new Date(), organizationId?: string): Promise<ScheduledRunResult> {
  const result: ScheduledRunResult = { due: 0, sent: 0, failed: 0, stuck: 0 };

  // One that has been "sending" far too long lost its run midway. It is not sent again (some
  // recipients may already have it), but marked failed so the church knows to check.
  const stuckCutoff = new Date(now.getTime() - STUCK_SENDING_MINUTES * 60_000).toISOString();
  const stuckQuery = admin
    .from("scheduled_campaigns")
    .update({ status: "failed", finished_at: now.toISOString(), result: { error: "The send was interrupted partway. Check the campaign history to see who received it." } })
    .eq("status", "sending")
    .lt("started_at", stuckCutoff);
  const { data: stuck } = await (organizationId ? stuckQuery.eq("organization_id", organizationId) : stuckQuery).select("id");
  result.stuck = stuck?.length ?? 0;

  const dueQuery = admin.from("scheduled_campaigns").select("*").eq("status", "scheduled").lte("scheduled_at", now.toISOString());
  const { data: due } = await (organizationId ? dueQuery.eq("organization_id", organizationId) : dueQuery).order("scheduled_at", { ascending: true }).limit(BATCH);
  for (const candidate of (due ?? []) as ScheduledCampaign[]) {
    // Claim it: only one run wins this update.
    const { data: claimed } = await admin.from("scheduled_campaigns").update({ status: "sending", started_at: now.toISOString() }).eq("id", candidate.id).eq("status", "scheduled").select("*").maybeSingle();
    if (!claimed) continue;
    const row = claimed as ScheduledCampaign;
    result.due++;

    let outcome: Awaited<ReturnType<typeof send>>;
    try {
      outcome = (await stillAllowed(admin, row.organization_id, row.created_by, row.channel))
        ? await send(admin, row)
        : { ok: false, error: "The person who scheduled this no longer has permission to send it." };
    } catch (err) {
      outcome = { ok: false, error: err instanceof Error ? err.message : "Something went wrong while sending." };
    }

    await admin
      .from("scheduled_campaigns")
      .update({ status: outcome.ok ? "sent" : "failed", finished_at: new Date().toISOString(), result: { sentCount: outcome.sentCount, failedCount: outcome.failedCount, skippedCount: outcome.skippedCount, error: outcome.error } })
      .eq("id", row.id);
    const files = (row.attachments as ScheduledAttachment[]).map((a) => a.path);
    if (files.length > 0) await admin.storage.from(BUCKET).remove(files);

    if (outcome.ok) result.sent++;
    else {
      result.failed++;
      await logPlatformEvent({ level: "warning", source: "scheduled_campaign", message: `Scheduled ${row.channel} campaign didn't go out: ${outcome.error}`, organizationId: row.organization_id, metadata: { id: row.id } });
    }

    // Tell whoever scheduled it how it went.
    if (row.created_by) {
      await sendPushToUsers([row.created_by], "team_alert", {
        title: outcome.ok ? `Your scheduled ${CHANNEL_NAMES[row.channel]} was sent` : `Your scheduled ${CHANNEL_NAMES[row.channel]} didn't go out`,
        body: outcome.ok ? `"${row.summary}" went to ${outcome.sentCount ?? row.recipient_count} ${outcome.sentCount === 1 ? "person" : "people"}.` : `"${row.summary}": ${outcome.error ?? "it couldn't be sent."}`.slice(0, 200),
        data: { type: "team_alert" },
      }).catch(() => {});
    }
  }
  return result;
}
