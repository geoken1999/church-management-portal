import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkSms } from "@/lib/sms/client";
import { isSmsConfigured } from "@/lib/sms/env";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { checkEmailQuota, checkSmsQuota } from "@/lib/plans/dal";
import { friendlyDeliveryReason } from "@/lib/whatsapp/contact-health";

export type FallbackChannel = "sms" | "email";

export async function getFallbackChannel(organizationId: string): Promise<"none" | FallbackChannel> {
  const admin = createAdminClient();
  const { data } = await admin.from("organizations").select("whatsapp_fallback").eq("id", organizationId).maybeSingle();
  return data?.whatsapp_fallback ?? "none";
}

export interface FallbackResult {
  ok: boolean;
  error?: string;
}

// Sends a message that WhatsApp couldn't deliver by SMS or email instead,
// using the church's own SMS/email allowance (the quota check is the same as
// for a normal send). For email, the member is found by their phone number;
// someone with no email on file can't be reached that way.
export async function sendFallbackMessage(input: { organizationId: string; channel: FallbackChannel; phone: string; text: string }): Promise<FallbackResult> {
  const { organizationId, channel, phone, text } = input;
  const admin = createAdminClient();

  if (channel === "sms") {
    if (!isSmsConfigured()) return { ok: false, error: "SMS isn't set up." };
    const quotaError = await checkSmsQuota(organizationId, 1);
    if (quotaError) return { ok: false, error: quotaError };
    const result = await sendBulkSms({ body: text, recipients: [phone], organizationId });
    return result.sentCount > 0 ? { ok: true } : { ok: false, error: result.failed[0]?.error ?? "SMS couldn't be sent." };
  }

  if (!isEmailConfigured()) return { ok: false, error: "Email isn't set up." };
  const tail = phone.replace(/\D/g, "").slice(-10);
  const [{ data: members }, { data: org }] = await Promise.all([
    admin.from("members").select("email, phone").eq("organization_id", organizationId).not("email", "is", null).like("phone", `%${tail}`),
    admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
  ]);
  const email = members?.find((m) => m.email)?.email;
  if (!email) return { ok: false, error: "No email address on file for this person." };
  const quotaError = await checkEmailQuota(organizationId, 1);
  if (quotaError) return { ok: false, error: quotaError };

  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />");
  const result = await sendBulkEmail({
    fromName: org?.name ?? "Your church",
    subject: `A message from ${org?.name ?? "your church"}`,
    html: `<p style="font-family: sans-serif; font-size: 15px; line-height: 1.5;">${escaped}</p>`,
    recipients: [email],
    organizationId,
  });
  return result.sentCount > 0 ? { ok: true } : { ok: false, error: result.failed[0]?.error ?? "The email couldn't be sent." };
}

// One logged message that failed to deliver: resend its text by the church's
// chosen fallback channel, once. Used for automations (birthday greetings, the
// staff digest), which have nobody watching a results page.
export async function fallbackForLoggedMessage(wamid: string): Promise<void> {
  const admin = createAdminClient();
  const { data: log } = await admin.from("whatsapp_message_log").select("*").eq("wamid", wamid).maybeSingle();
  if (!log || log.fallback_sent_at || !log.body_text || log.kind !== "automation") return;

  const channel = await getFallbackChannel(log.organization_id);
  if (channel === "none") return;

  // Claim it first so two callbacks for the same failure can't both send.
  const { data: claimed } = await admin
    .from("whatsapp_message_log")
    .update({ fallback_sent_at: new Date().toISOString() })
    .eq("id", log.id)
    .is("fallback_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const result = await sendFallbackMessage({ organizationId: log.organization_id, channel, phone: log.recipient, text: log.body_text });
  if (!result.ok) {
    // Let a later attempt try again.
    await admin.from("whatsapp_message_log").update({ fallback_sent_at: null }).eq("id", log.id);
    console.error(`WhatsApp fallback (${channel}) failed for ${log.recipient}: ${result.error} (${friendlyDeliveryReason(log.error_code)})`);
  }
}
