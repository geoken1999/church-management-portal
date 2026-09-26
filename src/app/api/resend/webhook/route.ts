import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getEmailEnv } from "@/lib/email/env";
import { recordMessageDelivery } from "@/lib/platform-events/delivery";

// Resend's async delivery events — a resend.emails.send()/batch.send()
// call resolving only means Resend ACCEPTED the email, not that it
// reached the recipient. Bounces, spam complaints, and delivery delays
// are reported later, here, the same async-status gap as Twilio's status
// callback for SMS/WhatsApp (src/app/api/twilio/status-callback).
//
// Resend webhooks are account-wide (one URL for every org's email), not
// per-send like Twilio's statusCallback param — so attributing an event
// back to an org relies entirely on the `organization_id` tag set at send
// time (see sendBulkEmail in src/lib/email/client.ts). Emails sent without
// that tag (e.g. this app's own platform-admin notifications) just record
// with organizationId: null.
const RELEVANT_EVENTS = new Set(["email.delivered", "email.bounced", "email.delivery_delayed", "email.complained", "email.failed"]);

// Resend event types map onto this app's generic delivery-status
// vocabulary (queued/sent/delivered/failed/undelivered/bounced/...) via
// this table rather than storing Resend's own "email.xxx" strings, so
// message_delivery_events reads the same way regardless of channel.
const STATUS_BY_EVENT: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.delivery_delayed": "delivery_delayed",
  "email.complained": "complained",
  "email.failed": "failed",
};

export async function POST(request: Request) {
  let apiKey: string;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  try {
    if (!webhookSecret) throw new Error("RESEND_WEBHOOK_SECRET not set");
    apiKey = getEmailEnv().apiKey;
  } catch {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();

  let payload: { type: string; data: Record<string, unknown> };
  try {
    const resend = new Resend(apiKey);
    payload = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    }) as unknown as { type: string; data: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!RELEVANT_EVENTS.has(payload.type)) {
    return NextResponse.json({ ok: true });
  }

  const data = payload.data;
  const emailId = String(data.email_id ?? data.id ?? "");
  if (!emailId) {
    return NextResponse.json({ ok: true });
  }

  const to = Array.isArray(data.to) ? String(data.to[0]) : typeof data.to === "string" ? data.to : null;
  const tags = Array.isArray(data.tags) ? (data.tags as { name: string; value: string }[]) : [];
  const organizationId = tags.find((tag) => tag.name === "organization_id")?.value ?? null;

  const bounceInfo = data.bounce as { message?: string; type?: string } | undefined;
  const errorMessage = bounceInfo?.message ?? (typeof data.reason === "string" ? data.reason : null);

  await recordMessageDelivery({
    organizationId,
    channel: "email",
    providerId: emailId,
    recipient: to,
    status: STATUS_BY_EVENT[payload.type] ?? payload.type,
    errorCode: bounceInfo?.type ?? null,
    errorMessage,
  });

  return NextResponse.json({ ok: true });
}
