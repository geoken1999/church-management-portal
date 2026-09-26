import { NextResponse } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSmsEnv } from "@/lib/sms/env";
import { getWhatsAppEnv } from "@/lib/whatsapp/env";
import { recordMessageDelivery } from "@/lib/platform-events/delivery";

// Shared async delivery-status endpoint for both SMS and WhatsApp sends —
// same Twilio payload shape either way (MessageSid, MessageStatus, To,
// From, ErrorCode, ErrorMessage), just routed by query params set when the
// message was created (see sendBulkSms/sendBulkWhatsApp's statusCallback
// URL). This is what actually catches delivery failures — client.messages
// .create() resolving only means Twilio ACCEPTED the send, not that it
// reached the recipient; that verdict arrives later, here.
//
// The auth token used to verify the signature depends on whose Twilio
// account sent the message: the platform's shared one for SMS and
// shared-mode WhatsApp, or the org's own connected account for
// own-mode WhatsApp — so which one to check has to be resolved from the
// query params before the signature can be verified at all.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const channel = url.searchParams.get("channel");
  const mode = url.searchParams.get("mode");

  if (!organizationId || (channel !== "sms" && channel !== "whatsapp")) {
    return new NextResponse("Bad request", { status: 400 });
  }

  let authToken: string;
  try {
    if (channel === "sms") {
      authToken = getSmsEnv().authToken;
    } else if (mode === "own") {
      const admin = createAdminClient();
      const { data: account } = await admin
        .from("organization_whatsapp_accounts")
        .select("auth_token")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!account) return new NextResponse("Not found", { status: 404 });
      authToken = account.auth_token;
    } else {
      authToken = getWhatsAppEnv().authToken;
    }
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
