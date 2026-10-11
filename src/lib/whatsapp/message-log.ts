import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { blockDaysFor, friendlyDeliveryReason, isBlocked } from "@/lib/whatsapp/contact-health";
import type { WhatsAppCredentials } from "@/lib/whatsapp/credentials";
import type { WhatsAppMessageKind } from "@/types/database";

// The business number a message goes out from. Whether a person can be
// reached is a property of that sender, so the log and the contact health
// are both keyed by it.
export function senderKeyFor(credentials: WhatsAppCredentials): string {
  return credentials.phoneNumberId;
}

export interface OutboundLogEntry {
  organizationId: string;
  kind: WhatsAppMessageKind;
  refId?: string | null;
  recipient: string;
  wamid: string;
  templateName: string | null;
  category: string | null;
  senderKey: string;
}

// Remembers each message WhatsApp accepted, by its id, so the delivery
// result that arrives later can be tied back to the church and the
// campaign/automation/pass that sent it. Best-effort: a failure here must
// never undo or fail the send itself.
export async function logOutboundMessages(entries: OutboundLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    const admin = createAdminClient();
    await admin.from("whatsapp_message_log").upsert(
      entries.map((e) => ({
        organization_id: e.organizationId,
        kind: e.kind,
        ref_id: e.refId ?? null,
        recipient: e.recipient,
        wamid: e.wamid,
        template_name: e.templateName,
        category: e.category,
        sender_key: e.senderKey,
      })),
      { onConflict: "wamid", ignoreDuplicates: true },
    );
  } catch (err) {
    console.error("logOutboundMessages failed:", err);
  }
}

// Of these phone numbers, the ones WhatsApp is currently holding marketing
// messages back from for this sender (see contact-health.ts).
export async function findBlockedRecipients(senderKey: string, phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_contact_health")
    .select("recipient, marketing_blocked_until")
    .eq("sender_key", senderKey)
    .in("recipient", phones);
  const now = new Date();
  return new Set((data ?? []).filter((row) => isBlocked(row.marketing_blocked_until, now)).map((row) => row.recipient));
}

// Splits recipients into those to send to and those to skip, for a template
// of this category. Only marketing messages are held back; anything else is
// sent as normal.
export async function splitBlocked<T extends { phone: string }>(
  senderKey: string,
  isMarketing: boolean,
  recipients: T[],
): Promise<{ sendable: T[]; skipped: { phone: string; reason: string }[] }> {
  if (!isMarketing) return { sendable: recipients, skipped: [] };
  const blocked = await findBlockedRecipients(senderKey, recipients.map((r) => r.phone));
  if (blocked.size === 0) return { sendable: recipients, skipped: [] };
  const reason = `${friendlyDeliveryReason("131049")} Skipped for now; we'll try again later.`;
  return {
    sendable: recipients.filter((r) => !blocked.has(r.phone)),
    skipped: recipients.filter((r) => blocked.has(r.phone)).map((r) => ({ phone: r.phone, reason })),
  };
}

// A person messaging us (or a message reaching them) shows they can be
// reached: lift any pause.
export async function clearContactHealth(senderKey: string, recipient: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("whatsapp_contact_health")
    .update({ marketing_blocked_until: null, consecutive_failures: 0, last_error_code: null })
    .eq("sender_key", senderKey)
    .eq("recipient", recipient);
}

export interface DeliveryAttribution {
  organizationId: string;
  kind: WhatsAppMessageKind;
  refId: string | null;
}

// Applies a delivery status from WhatsApp's webhook to the logged message:
//  - records the status;
//  - a 131049 (or unreachable) failure pauses marketing sends to that person
//    for that sender, for longer each time it repeats; a delivery or read
//    lifts the pause;
//  - a failed campaign message is taken off that campaign's delivered count,
//    once, so the church's monthly WhatsApp usage reflects what was delivered.
// Returns who sent it, or null if we never logged this message (e.g. an
// inbox reply, which is tracked elsewhere).
export async function applyDeliveryStatus(input: { wamid: string; status: string; errorCode?: string | null }): Promise<DeliveryAttribution | null> {
  const admin = createAdminClient();
  const { data: log } = await admin.from("whatsapp_message_log").select("*").eq("wamid", input.wamid).maybeSingle();
  if (!log) return null;

  // Statuses can arrive out of order; never move a message backwards out of a
  // failure or from read/delivered.
  const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
  const nextStatus = (rank[input.status] ?? 0) >= (rank[log.status] ?? 0) ? input.status : log.status;

  await admin
    .from("whatsapp_message_log")
    .update({ status: nextStatus, error_code: input.status === "failed" ? input.errorCode ?? log.error_code : log.error_code })
    .eq("id", log.id);

  if (input.status === "delivered" || input.status === "read") {
    await clearContactHealth(log.sender_key, log.recipient);
  }

  // Only the first time a message turns failed: a repeated callback must not
  // count as another failure.
  if (input.status === "failed" && log.status !== "failed") {
    const { data: health } = await admin
      .from("whatsapp_contact_health")
      .select("consecutive_failures")
      .eq("sender_key", log.sender_key)
      .eq("recipient", log.recipient)
      .maybeSingle();
    const consecutive = (health?.consecutive_failures ?? 0) + 1;
    const days = blockDaysFor(input.errorCode, consecutive);
    if (days !== null) {
      await admin.from("whatsapp_contact_health").upsert(
        {
          sender_key: log.sender_key,
          recipient: log.recipient,
          consecutive_failures: consecutive,
          marketing_blocked_until: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
          last_error_code: input.errorCode ?? null,
        },
        { onConflict: "sender_key,recipient" },
      );
    }

    if (log.kind === "campaign" && log.ref_id && !log.credited_back) {
      const { data: campaign } = await admin.from("whatsapp_campaigns").select("sent_count, failed_count, failed_recipients").eq("id", log.ref_id).maybeSingle();
      if (campaign) {
        await admin
          .from("whatsapp_campaigns")
          .update({
            sent_count: Math.max(0, campaign.sent_count - 1),
            failed_count: campaign.failed_count + 1,
            failed_recipients: [...campaign.failed_recipients, { phone: log.recipient, error: friendlyDeliveryReason(input.errorCode) }],
          })
          .eq("id", log.ref_id);
        await admin.from("whatsapp_message_log").update({ credited_back: true }).eq("id", log.id);
      }
    }
  }

  return { organizationId: log.organization_id, kind: log.kind, refId: log.ref_id };
}
