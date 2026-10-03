import { NextResponse } from "next/server";
import twilio from "twilio";
import { getSmsEnv } from "@/lib/sms/env";
import { recordMessageDelivery } from "@/lib/platform-events/delivery";

// Async delivery-status endpoint for SMS sends (MessageSid, MessageStatus,
// To, From, ErrorCode, ErrorMessage) — see sendBulkSms's statusCallback
// URL. This is what actually catches delivery failures — client.messages
// .create() resolving only means Twilio ACCEPTED the send, not that it
// reached the recipient; that verdict arrives later, here.
//
// WhatsApp used to share this endpoint too, back when it sent through
// Twilio — it now sends through Meta's Cloud API directly (see migration
// 0097), whose delivery-status updates arrive via src/app/api/whatsapp/
// webhook's own `statuses` handling instead, so the "channel" branching
// this route used to have is gone.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const channel = url.searchParams.get("channel");

  if (!organizationId || channel !== "sms") {
    return new NextResponse("Bad request", { status: 400 });
  }

  let authToken: string;
  try {
    authToken = getSmsEnv().authToken;
  } catch {
    return new NextResponse("Not configured", { status: 500 });
  }

  const rawBody = await request.text();
  const bodyParams = new URLSearchParams(rawBody);
  const paramsObject = Object.fromEntries(bodyParams.entries());
  const signature = request.headers.get("x-twilio-signature");

  if (!signature || !twilio.validateRequest(authToken, signature, request.url, paramsObject)) {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const messageSid = paramsObject.MessageSid;
  const status = paramsObject.MessageStatus;
  if (!messageSid || !status) {
    return new NextResponse("", { status: 200 });
  }

  await recordMessageDelivery({
    organizationId,
    channel,
    providerId: messageSid,
    recipient: paramsObject.To ?? null,
    status,
    errorCode: paramsObject.ErrorCode ?? null,
    errorMessage: paramsObject.ErrorMessage ?? null,
  });

  return new NextResponse("", { status: 200 });
}
