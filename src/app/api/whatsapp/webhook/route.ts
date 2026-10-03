import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { getMetaWhatsAppEnv, getMetaWhatsAppWebhookVerifyToken } from "@/lib/whatsapp/env";
import { resolveOrganizationForPhoneNumber } from "@/lib/whatsapp/routing";
import { generateReply, type ChatTurn } from "@/lib/ai/openai";
import { getOrganizationContextForAi } from "@/lib/ai/organization-context";
import { getAiModeForWebhook, setAiTypingForWebhook } from "@/lib/whatsapp/automation";
import { hasAiCreditAvailableForWebhook, recordAiReplyUsageForWebhook } from "@/lib/plans/dal";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { createNotificationForWebhook } from "@/lib/notifications/create";
import { recordMessageDelivery } from "@/lib/platform-events/delivery";

// One shared endpoint for the whole platform's single WhatsApp Business
// number (see migration 0097) — unlike the old per-org Twilio webhook,
// there's no organizationId in this URL, since Meta's payload carries
// none either; resolveOrganizationForPhoneNumber figures out which org an
// inbound message belongs to.

// Meta's webhook verification handshake, run once when the Callback URL is
// saved in the App Dashboard — same mechanism as the Instagram webhook
// (both are Meta Graph API webhooks). Echoing back hub.challenge as plain
// text is what the handshake requires.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === getMetaWhatsAppWebhookVerifyToken() && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface InboundMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
}

interface StatusUpdate {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}

interface WebhookChangeValue {
  messages?: InboundMessage[];
  statuses?: StatusUpdate[];
}

interface WebhookChange {
  field?: string;
  value?: WebhookChangeValue;
}

interface WebhookEntry {
  changes?: WebhookChange[];
}

interface WebhookPayload {
  entry?: WebhookEntry[];
}

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

    // Always a free-text send — this only ever fires in direct response to
    // an inbound message, so it's always inside the 24-hour customer
    // service window where free text is allowed.
    const sent = await sendTextMessage({ to: phoneNumber, body: outgoingReply });

    await admin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      organization_id: organizationId,
      direction: "outbound",
      body: outgoingReply,
      twilio_sid: sent.id,
      status: "sent",
    });
    await admin
      .from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString(), last_message_preview: outgoingReply.slice(0, 200) })
      .eq("id", conversationId);

    // Only charged on a confirmed send — a failed generation or Graph API
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

async function handleInboundMessage(message: InboundMessage): Promise<void> {
  const fromRaw = message.from;
  const text = message.text?.body;
  if (!fromRaw) return;

  const phoneNumber = `+${fromRaw}`;

  const organizationId = await resolveOrganizationForPhoneNumber(phoneNumber);
  if (!organizationId) return;

  const admin = createAdminClient();

  const { data: member } = await admin.from("members").select("id").eq("organization_id", organizationId).eq("phone", phoneNumber).maybeSingle();

  const { data: conversation } = await admin
    .from("whatsapp_conversations")
    .upsert(
      {
        organization_id: organizationId,
        phone_number: phoneNumber,
        member_id: member?.id ?? null,
        last_message_at: new Date().toISOString(),
        last_message_preview: (text ?? "").slice(0, 200),
      },
      { onConflict: "organization_id,phone_number" },
    )
    .select("id, unread_count")
    .single();

  if (!conversation) return;

  await admin.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    organization_id: organizationId,
    direction: "inbound",
    body: text ?? `[Unsupported message type: ${message.type ?? "unknown"}]`,
    twilio_sid: message.id ?? null,
    status: "received",
  });

  await admin
    .from("whatsapp_conversations")
    .update({ unread_count: conversation.unread_count + 1 })
    .eq("id", conversation.id);

  await handleWhatsAppAiReply(organizationId, phoneNumber, conversation.id).catch(() => {});
}

// Meta's statuses are lowercase already (sent/delivered/read/failed) — no
// mapping needed to match the "failed"/"undelivered" style Twilio used.
async function handleStatusUpdate(status: StatusUpdate): Promise<void> {
  const messageId = status.id;
  const newStatus = status.status;
  if (!messageId || !newStatus) return;

  const admin = createAdminClient();
  const { data: message } = await admin
    .from("whatsapp_messages")
    .update({ status: newStatus })
    .eq("twilio_sid", messageId)
    .select("organization_id")
    .maybeSingle();

  const firstError = status.errors?.[0];
  await recordMessageDelivery({
    organizationId: message?.organization_id ?? null,
    channel: "whatsapp",
    providerId: messageId,
    recipient: status.recipient_id ? `+${status.recipient_id}` : null,
    status: newStatus,
    errorCode: firstError?.code != null ? String(firstError.code) : null,
    errorMessage: firstError?.message ?? firstError?.title ?? null,
  });
}

export async function POST(request: Request) {
  const { appSecret } = getMetaWhatsAppEnv();
  const signature = request.headers.get("x-hub-signature-256");
  const rawBody = await request.text();

  if (!signature?.startsWith("sha256=")) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signature.slice("sha256=".length);
  const isValid =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Not valid JSON — nothing to process, but still ack so Meta doesn't
    // treat this as a failure and retry-storm the endpoint.
    return NextResponse.json({ received: true });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        await handleInboundMessage(message).catch(() => {});
      }
      for (const status of change.value?.statuses ?? []) {
        await handleStatusUpdate(status).catch(() => {});
      }
    }
  }

  return NextResponse.json({ received: true });
}
