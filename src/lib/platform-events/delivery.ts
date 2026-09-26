import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { MessageDeliveryChannel } from "@/types/database";

// Statuses that mean the message did NOT reach the recipient — worth a
// platform_events entry so it surfaces on the Super Admin Logs page
// instead of only being visible via a manual provider API query (see the
// WhatsApp 63051/63015 errors debugged live — both looked like "sent" in
// this app's own campaign tables until checked directly against Twilio).
const FAILURE_STATUSES = new Set(["failed", "undelivered", "bounced", "delivery_delayed", "complained"]);

// Called by every provider webhook (Twilio's status callback for SMS/
// WhatsApp, Resend's for Email) — upserts by (channel, provider_id) so
// repeated status updates for the same message (queued -> sent ->
// delivered, or -> failed) land on one row rather than accumulating one
// per callback.
export async function recordMessageDelivery(input: {
  organizationId: string | null;
  channel: MessageDeliveryChannel;
  providerId: string;
  recipient: string | null;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from("message_delivery_events").upsert(
    {
      organization_id: input.organizationId,
      channel: input.channel,
      provider_id: input.providerId,
      recipient: input.recipient,
      status: input.status,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
    },
    { onConflict: "channel,provider_id" },
  );

  if (!FAILURE_STATUSES.has(input.status)) return;

  const source = input.channel === "sms" ? "sms_send" : input.channel === "whatsapp" ? "whatsapp_send" : "email_send";
  const detail = [input.errorCode, input.errorMessage].filter(Boolean).join(": ");

  await logPlatformEvent({
    level: "error",
    source,
    message: `${input.channel} delivery ${input.status}${detail ? ` — ${detail}` : ""}`,
    organizationId: input.organizationId,
    metadata: { providerId: input.providerId, recipient: input.recipient, status: input.status, errorCode: input.errorCode ?? null },
  });
}
