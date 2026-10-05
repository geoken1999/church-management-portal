import "server-only";

import { isSameNumber, nationalTail } from "@/lib/whatsapp/phone-match";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";

// With one WhatsApp number shared by every org on the platform, an
// inbound message carries no organization_id — Meta's payload has no
// concept of "tenant." This resolves one, or returns null if it can't be
// done safely:
//
//  1. If this phone number already has a conversation in exactly one org,
//     stick with it — once a thread starts, it stays with that org for
//     its lifetime (the simplest, most predictable rule, though it means
//     the same number can't separately message two different churches on
//     this platform within the same thread).
//  2. Otherwise, resolve by matching the number against every org's
//     members — if it belongs to a member of exactly one org, start the
//     conversation there.
//  3. No match, or matches spanning more than one org (ambiguous): return
//     null rather than guess. Guessing wrong would leak one church's
//     congregant message into another church's inbox, which is worse
//     than dropping the message.
export async function resolveOrganizationForPhoneNumber(phoneNumber: string): Promise<string | null> {
  const admin = createAdminClient();

  const { data: existingConversations } = await admin
    .from("whatsapp_conversations")
    .select("organization_id")
    .eq("phone_number", phoneNumber);

  const existingOrgIds = new Set((existingConversations ?? []).map((c) => c.organization_id));
  if (existingOrgIds.size === 1) return [...existingOrgIds][0];
  if (existingOrgIds.size > 1) {
    await logPlatformEvent({
      level: "warning",
      source: "whatsapp_webhook",
      message: "Inbound WhatsApp message dropped: phone number has conversations in multiple orgs",
      metadata: { phoneNumber, orgCount: existingOrgIds.size },
    });
    return null;
  }

  // Meta sends the sender in full international form (+91…), while members
  // are usually saved without the country code, sometimes with a leading 0.
  // Compare on the last 10 digits, the national number for India and most
  // of the churches' numbers. Ambiguity across orgs is still refused below.
  const tail = nationalTail(phoneNumber);
  const { data: candidates } = tail.length === 10
    ? await admin.from("members").select("organization_id, phone").like("phone", `%${tail}`)
    : { data: [] as { organization_id: string; phone: string | null }[] };
  const matchingMembers = (candidates ?? []).filter((m) => m.phone && isSameNumber(m.phone, phoneNumber));
  const memberOrgIds = new Set(matchingMembers.map((m) => m.organization_id));

  if (memberOrgIds.size === 1) return [...memberOrgIds][0];
  if (memberOrgIds.size > 1) {
    await logPlatformEvent({
      level: "warning",
      source: "whatsapp_webhook",
      message: "Inbound WhatsApp message dropped: phone number matches members in multiple orgs",
      metadata: { phoneNumber, orgCount: memberOrgIds.size },
    });
    return null;
  }

  await logPlatformEvent({
    level: "info",
    source: "whatsapp_webhook",
    message: "Inbound WhatsApp message dropped: no org could be resolved for this phone number",
    metadata: { phoneNumber },
  });
  return null;
}
