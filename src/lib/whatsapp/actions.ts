"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { checkWhatsAppQuota } from "@/lib/plans/dal";
import { sendBulkWhatsApp, sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { resolveWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import {
  normalizePhoneNumber,
  validateWhatsAppBody,
  validateWhatsAppAccountSid,
  validateWhatsAppAuthToken,
  validateWhatsAppNumber,
} from "@/lib/whatsapp/validation";
import type { WhatsAppCampaignStatus, WhatsAppMode } from "@/types/database";

const WHATSAPP_PATH = "/dashboard/whatsapp";

// Connecting/removing the org's own Twilio account is owner/admin-only —
// same reasoning and shape as requireOrgAdmin in finance/actions.ts for
// Razorpay credentials: it controls where real API credentials go, so the
// tab-permissions matrix shouldn't be able to delegate it to regular staff.
async function requireOrgAdmin(organizationId: string, authUserId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}

// ---------------------------------------------------------------------------
// Own account
// ---------------------------------------------------------------------------

export interface WhatsAppAccountState {
  error?: string;
  success?: boolean;
}

export async function saveOwnWhatsAppAccount(_prevState: WhatsAppAccountState, formData: FormData): Promise<WhatsAppAccountState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  if (!(await requireOrgAdmin(organizationId, user.id))) {
    return { error: "Only an owner or admin can connect a WhatsApp number." };
  }

  const accountSid = String(formData.get("accountSid") ?? "").trim();
  const authToken = String(formData.get("authToken") ?? "").trim();
  const numberRaw = String(formData.get("whatsappNumber") ?? "").trim();

  const sidError = validateWhatsAppAccountSid(accountSid);
  if (sidError) return { error: sidError };
  const tokenError = validateWhatsAppAuthToken(authToken);
  if (tokenError) return { error: tokenError };
  const numberError = validateWhatsAppNumber(numberRaw);
  if (numberError) return { error: numberError };

  const whatsappNumber = normalizePhoneNumber(numberRaw);
  if (!whatsappNumber) return { error: "Enter a valid phone number, e.g. +14155552671." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_whatsapp_accounts")
    .upsert(
      { organization_id: organizationId, account_sid: accountSid, auth_token: authToken, whatsapp_number: whatsappNumber, connected_by: user.id },
      { onConflict: "organization_id" },
    );

  if (error) {
    return { error: "Couldn't save that WhatsApp number. Please try again." };
  }

  revalidatePath(WHATSAPP_PATH);
  return { success: true };
}

export async function removeOwnWhatsAppAccount(formData: FormData) {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  if (!(await requireOrgAdmin(organizationId, user.id))) return;

  const admin = createAdminClient();
  await admin.from("organization_whatsapp_accounts").delete().eq("organization_id", organizationId);

  revalidatePath(WHATSAPP_PATH);
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface SendWhatsAppState {
  error?: string;
  success?: boolean;
  sentCount?: number;
  failedCount?: number;
}

export async function sendBulkWhatsAppAction(formData: FormData): Promise<SendWhatsAppState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const access = await checkTabAccess(organizationId, "whatsapp", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const body = String(formData.get("body") ?? "").trim();
  const bodyError = validateWhatsAppBody(body);
  if (bodyError) return { error: bodyError };

  const modeRaw = String(formData.get("mode") ?? "shared");
  const mode: WhatsAppMode = modeRaw === "own" ? "own" : "shared";

  const recipientsRaw = String(formData.get("recipients") ?? "[]");
  let rawRecipients: unknown;
  try {
    rawRecipients = JSON.parse(recipientsRaw);
  } catch {
    return { error: "Select at least one recipient." };
  }
  if (!Array.isArray(rawRecipients)) {
    return { error: "Select at least one recipient." };
  }

  const recipients = Array.from(
    new Set(
      rawRecipients
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const { phone, countryCode } = entry as { phone?: unknown; countryCode?: unknown };
          if (typeof phone !== "string") return null;
          return normalizePhoneNumber(phone, typeof countryCode === "string" ? countryCode : null);
        })
        .filter((phone): phone is string => Boolean(phone)),
    ),
  );

  if (recipients.length === 0) {
    return { error: "Select at least one valid recipient." };
  }

  if (mode === "shared") {
    const quotaError = await checkWhatsAppQuota(organizationId, recipients.length);
    if (quotaError) return { error: quotaError };
  }

  const credentials = await resolveWhatsAppCredentials(organizationId, mode);
  if (!credentials) {
    return { error: mode === "own" ? "Connect your WhatsApp number first." : "WhatsApp isn't configured yet — ask your developer to set it up." };
  }

  let result;
  try {
    result = await sendBulkWhatsApp({ credentials, body, recipients });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't send that message." };
  }

  const status: WhatsAppCampaignStatus =
    result.failed.length === 0 ? "sent" : result.sentCount === 0 ? "failed" : "partial_failure";

  // RLS-restricted to admins by default — the admin client performs the
  // actual insert so a "member" role granted whatsapp write via the tab
  // permissions matrix can still send; checkTabAccess above is what
  // actually gates who gets here (same pattern as sms_campaigns).
  const admin = createAdminClient();
  await admin.from("whatsapp_campaigns").insert({
    organization_id: organizationId,
    mode,
    body,
    recipient_count: recipients.length,
    sent_count: result.sentCount,
    failed_count: result.failed.length,
    failed_recipients: result.failed,
    status,
    sent_by: user.id,
  });

  revalidatePath(WHATSAPP_PATH);

  if (status === "failed") {
    return { error: result.failed[0]?.error ?? "Couldn't send that message.", sentCount: 0, failedCount: recipients.length };
  }

  return { success: true, sentCount: result.sentCount, failedCount: result.failed.length };
}

// ---------------------------------------------------------------------------
// Chat — 'own' mode only
// ---------------------------------------------------------------------------

export interface SendWhatsAppReplyState {
  error?: string;
  success?: boolean;
}

export async function sendWhatsAppReplyAction(conversationId: string, body: string): Promise<SendWhatsAppReplyState> {
  await requireUser();

  const bodyError = validateWhatsAppBody(body);
  if (bodyError) return { error: bodyError };

  const admin = createAdminClient();
  const { data: conversation } = await admin
    .from("whatsapp_conversations")
    .select("id, organization_id, phone_number")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return { error: "That conversation could not be found." };
  }

  const access = await checkTabAccess(conversation.organization_id, "whatsapp", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const credentials = await resolveWhatsAppCredentials(conversation.organization_id, "own");
  if (!credentials) {
    return { error: "Your WhatsApp number isn't connected anymore — reconnect it to keep replying." };
  }

  let sid: string;
  try {
    const result = await sendWhatsAppMessage({ credentials, to: conversation.phone_number, body });
    sid = result.sid;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't send that reply." };
  }

  await admin.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    organization_id: conversation.organization_id,
    direction: "outbound",
    body,
    twilio_sid: sid,
    status: "sent",
  });

  await admin
    .from("whatsapp_conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 200) })
    .eq("id", conversation.id);

  revalidatePath(WHATSAPP_PATH);
  return { success: true };
}

export async function markWhatsAppConversationRead(conversationId: string) {
  await requireUser();

  const admin = createAdminClient();
  const { data: conversation } = await admin
    .from("whatsapp_conversations")
    .select("organization_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return;

  const access = await checkTabAccess(conversation.organization_id, "whatsapp", "read");
  if (!access.ok) return;

  await admin.from("whatsapp_conversations").update({ unread_count: 0 }).eq("id", conversationId);
  revalidatePath(WHATSAPP_PATH);
}
