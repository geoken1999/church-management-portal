import "server-only";

import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { RETENTION_DAYS } from "@/lib/retention/rules";

const FROM_ADDRESS = "billing@kingdomflow.in";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

// The people who decide for a church: its owner and admins.
export async function getRetentionRecipients(organizationId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: managers } = await admin.from("organization_members").select("auth_user_id").eq("organization_id", organizationId).in("role", ["owner", "admin"]);
  const ids = (managers ?? []).map((m) => m.auth_user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await admin.from("profiles").select("email").in("id", ids);
  return [...new Set((profiles ?? []).map((p) => p.email).filter((e): e is string => Boolean(e)))];
}

export type RetentionEmailKind = "reminder" | "final";

// A reminder to resubscribe, or the final warning the day before the church's data
// is deleted. Returns whether it was sent to at least one address.
export async function sendRetentionEmail(params: { organizationId: string; churchName: string; deleteOn: Date; kind: RetentionEmailKind }): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const recipients = await getRetentionRecipients(params.organizationId);
  if (recipients.length === 0) return false;

  const name = escapeHtml(params.churchName);
  const deleteOn = formatDate(params.deleteOn);
  const billingUrl = `${getSiteUrl()}/dashboard/billing`;
  const final = params.kind === "final";

  const subject = final ? `Last chance: ${params.churchName}'s KingdomFlow data is deleted tomorrow` : `Resubscribe to keep ${params.churchName}'s KingdomFlow account`;
  const headline = final ? "Your church's data will be deleted tomorrow" : "Your KingdomFlow access has ended";
  const lead = final
    ? `<strong>${name}'s account and all of its data will be permanently deleted tomorrow, ${deleteOn}.</strong> After that it cannot be recovered.`
    : `${name} no longer has an active KingdomFlow subscription, so your team can't use the app. Your data is still safe, but only until <strong>${deleteOn}</strong> (${RETENTION_DAYS} days after access ended). After that, ${name}'s account and all of its data are permanently deleted.`;
  const detail = final
    ? "To keep everything, subscribe today. Once you subscribe, the deletion is cancelled and everything is exactly as you left it."
    : "To keep everything, resubscribe from the Billing page. Once you do, the countdown stops and everything is exactly as you left it. We'll remind you again in a week if you haven't.";

  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #111;">
      <div style="border: 1px solid #eee; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 16px; font-size: 18px; ${final ? "color: #b91c1c;" : ""}">${headline}</h1>
        <p>${lead}</p>
        <p>This includes your members, events, attendance, giving and accounting records, documents, forms, messages and team logins.</p>
        <p>${detail}</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${escapeHtml(billingUrl)}" style="display: inline-block; background: #7c3aed; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
            Subscribe now
          </a>
        </div>
        <p style="color: #666; font-size: 13px;">If you no longer need KingdomFlow, you don't need to do anything. If you have questions or need more time, reply to this email or contact us from the website.</p>
      </div>
    </div>
  `;

  try {
    const result = await sendBulkEmail({ fromName: "KingdomFlow", fromAddress: FROM_ADDRESS, subject, html, recipients });
    return result.sentCount > 0;
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "email_send",
      message: `Retention ${params.kind} email failed for ${params.churchName}: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: params.organizationId,
    });
    return false;
  }
}
