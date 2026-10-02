import { NextResponse } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { generateReply, type ChatTurn } from "@/lib/ai/openai";
import { getOrganizationContextForAi } from "@/lib/ai/organization-context";
import { getAiModeForWebhook, setAiTypingForWebhook } from "@/lib/whatsapp/automation";
import { hasAiCreditAvailableForWebhook, recordAiReplyUsageForWebhook } from "@/lib/plans/dal";
import { resolveWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { createNotificationForWebhook } from "@/lib/notifications/create";

// Same sentinel-marker pattern as the Instagram DM AI auto-reply (see
// src/app/api/instagram/webhook/route.ts) — appended by the model on its
// own line whenever it can't answer from the org data it was given,
// parsed back out and stripped before the WhatsApp message is sent, used
// purely as the signal to notify staff.
const STAFF_FOLLOWUP_MARKER = "[[NEEDS_STAFF_FOLLOWUP]]";

function buildAiSystemPrompt(organizationContext: string): string {
  return [
    "You are replying to WhatsApp messages on behalf of a church's WhatsApp number.",
    "Keep replies short, warm, and natural, like a real person texting back. Never mention that you are an AI.",
    "",
    "Use the organization data below to answer questions about events, ministries, locations, fundraisers, or",
    "forms accurately. Only state details (names, dates, times, amounts, links) that appear below — never invent",
    "or guess ones that aren't listed.",
    "",
    "If someone asks something you can't answer from the data below, don't guess or make something up. Instead,",
    "tell them warmly that it's outside what you can help with right now and that you've let the team know to",
    "follow up with them directly — then, on its own new line at the very end of your reply, add exactly:",
    STAFF_FOLLOWUP_MARKER,
    "",
    "Branch/location contact names and phone numbers below ARE meant to be shared — that's how someone reaches a",
    "specific location, and the church has chosen to publish it. That's different from anything else about a",
    "specific individual: never share or guess a staff member's, leader's, volunteer's, or congregant's personal",
    "details beyond that — no donation history, attendance, or other private information. The data below",
    "deliberately contains none of that; if asked for it, say that's not something you can share.",
    "",
    organizationContext,
  ].join("\n");
}

// Mirrors the Instagram webhook's handleMessagingEvent — generates and
// sends an AI reply, charging one shared AI credit, only when this
// conversation has AI mode turned on (see whatsapp/automation.ts's
// setAiMode, toggled from the chat UI).
async function handleWhatsAppAiReply(organizationId: string, phoneNumber: string, conversationId: string): Promise<void> {
  const aiEnabled = await getAiModeForWebhook(organizationId, phoneNumber);
  if (!aiEnabled) return;

  // Checked before generating anything, not just before sending — no point
  // spending an OpenAI call on a reply the org's plan has no credit left
  // to send.
  if (!(await hasAiCreditAvailableForWebhook(organizationId))) return;

  const admin = createAdminClient();

  await setAiTypingForWebhook(organizationId, phoneNumber, true);
  try {
    const [organizationContext, { data: recent }] = await Promise.all([
      getOrganizationContextForAi(organizationId),
      admin
        .from("whatsapp_messages")
        .select("direction, body")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const history: ChatTurn[] = (recent ?? [])
      .reverse()
      .filter((m) => m.body)
      .map((m) => ({ role: m.direction === "outbound" ? "assistant" : "user", content: m.body }));

    const reply = await generateReply(buildAiSystemPrompt(organizationContext), history);
    if (!reply) return;

    const needsStaffFollowUp = reply.includes(STAFF_FOLLOWUP_MARKER);
    const outgoingReply = reply.replace(STAFF_FOLLOWUP_MARKER, "").trim();

    const credentials = await resolveWhatsAppCredentials(organizationId, "own");
    if (!credentials) return;

    const sent = await sendWhatsAppMessage({ credentials, to: phoneNumber, body: outgoingReply, organizationId });

    await admin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      organization_id: organizationId,
      direction: "outbound",
      body: outgoingReply,
      twilio_sid: sent.sid,
      status: "sent",
    });
    await admin
      .from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString(), last_message_preview: outgoingReply.slice(0, 200) })
      .eq("id", conversationId);

    // Only charged on a confirmed send — a failed generation or Twilio
    // call shouldn't cost the org a credit.
    await recordAiReplyUsageForWebhook(organizationId, phoneNumber, "whatsapp");

    if (needsStaffFollowUp) {
      await createNotificationForWebhook({
        organizationId,
        type: "whatsapp_ai_followup",
        title: "WhatsApp message needs a staff reply",
        body: `${phoneNumber} asked something the AI couldn't answer from your organization's data. Open the conversation to follow up directly.`,
        link: "/dashboard/whatsapp",
      });
    }
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "whatsapp_webhook",
      message: `AI auto-reply failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
    });
  } finally {
    await setAiTypingForWebhook(organizationId, phoneNumber, false);
  }
}

// Inbound WhatsApp messages — 'own' mode only (see migration 0058). Each
// org's own Twilio WhatsApp number is configured, by the church, to POST
// here with their organizationId in the URL, so there's no ambiguity
// about which org an inbound message belongs to (unlike the shared
// number, which isn't wired to this route at all).
//
// Twilio signs the request over the exact URL + form params (not the raw
// body, unlike Razorpay's webhook) using the SAME auth token as the
// account sending the messages — so verification has to happen after
// looking up which org's (and therefore which auth token's) webhook this
// is, rather than against one fixed platform secret.
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("organization_whatsapp_accounts")
    .select("auth_token")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!account) {
    // No connected account for this org (removed, or a stale/incorrect
    // webhook URL) — 404 rather than 200 so a misconfigured webhook is
    // visible in Twilio's own delivery logs instead of silently "working."
    return new NextResponse("Not found", { status: 404 });
  }

  const rawBody = await request.text();
  const bodyParams = new URLSearchParams(rawBody);
  const paramsObject = Object.fromEntries(bodyParams.entries());

  const signature = request.headers.get("x-twilio-signature");
  const url = request.url;

  if (!signature || !twilio.validateRequest(account.auth_token, signature, url, paramsObject)) {
    await logPlatformEvent({
      level: "warning",
      source: "whatsapp_webhook",
      message: "Invalid WhatsApp webhook signature",
      organizationId,
    });
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const from = paramsObject.From; // "whatsapp:+14155552671"
  const body = paramsObject.Body ?? "";
  const messageSid = paramsObject.MessageSid ?? paramsObject.SmsMessageSid ?? null;

  if (!from) {
    return new NextResponse("", { status: 200, headers: { "Content-Type": "text/xml" } });
  }
  const phoneNumber = from.replace(/^whatsapp:/, "");

  // Best-effort link to an existing congregant — an exact match on the
  // stored phone value; if formats differ (unnormalized member records),
  // the conversation still works, it just won't show a name.
  const { data: member } = await admin
    .from("members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phoneNumber)
    .maybeSingle();

  const { data: conversation } = await admin
    .from("whatsapp_conversations")
    .upsert(
      {
        organization_id: organizationId,
        phone_number: phoneNumber,
        member_id: member?.id ?? null,
        last_message_at: new Date().toISOString(),
        last_message_preview: body.slice(0, 200),
      },
      { onConflict: "organization_id,phone_number" },
    )
    .select("id, unread_count")
    .single();

  if (conversation) {
    await admin.from("whatsapp_messages").insert({
      conversation_id: conversation.id,
      organization_id: organizationId,
      direction: "inbound",
      body,
      twilio_sid: messageSid,
      status: "received",
    });

    await admin
      .from("whatsapp_conversations")
      .update({ unread_count: conversation.unread_count + 1 })
      .eq("id", conversation.id);

    await handleWhatsAppAiReply(organizationId, phoneNumber, conversation.id).catch(() => {});
  }

  // Empty TwiML response — acknowledges receipt. If AI mode is on for this
  // conversation, the actual reply was already sent above via a separate
  // outbound Twilio API call, not through this TwiML response.
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
