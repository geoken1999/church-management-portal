import { NextResponse } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";

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
  }

  // Empty TwiML response — acknowledges receipt without sending an
  // automatic reply.
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
