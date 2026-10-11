import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSameNumber, nationalTail } from "@/lib/whatsapp/phone-match";

// Records that the person at this phone number opted out of (false) or back
// into (true) WhatsApp messages, on every member record of this church that
// has the number. Matches the way inbound messages are matched to members
// (last 10 digits, then a full comparison), since a stored number often has
// no country code. Returns how many members were updated.
export async function setWhatsAppOptIn(organizationId: string, phoneNumber: string, value: boolean): Promise<number> {
  const tail = nationalTail(phoneNumber);
  if (tail.length !== 10) return 0;

  const admin = createAdminClient();
  const { data: candidates } = await admin.from("members").select("id, phone").eq("organization_id", organizationId).like("phone", `%${tail}`);
  const ids = (candidates ?? []).filter((m) => m.phone && isSameNumber(m.phone, phoneNumber)).map((m) => m.id);
  if (ids.length === 0) return 0;

  await admin.from("members").update({ whatsapp_opt_in: value }).in("id", ids);
  return ids.length;
}
