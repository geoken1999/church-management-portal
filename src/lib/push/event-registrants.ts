import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { matchRegistrantsToAuthIds } from "@/lib/events/change-summary";
import { sendPushToUsers } from "@/lib/push/client";

// Tells the people registered for an event (and who use the app) that it has
// changed. Best-effort, like every push.
export async function notifyEventRegistrants(eventId: string, title: string, body: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: event } = await admin.from("events").select("organization_id").eq("id", eventId).maybeSingle();
    if (!event) return;

    const [{ data: registrants }, { data: members }] = await Promise.all([
      admin.from("event_registrations").select("email, phone").eq("event_id", eventId).in("status", ["confirmed", "checked_in"]),
      admin.from("members").select("auth_user_id, email, phone").eq("organization_id", event.organization_id).eq("status", "active").not("auth_user_id", "is", null),
    ]);
    const recipients = matchRegistrantsToAuthIds(registrants ?? [], members ?? []);
    await sendPushToUsers(recipients, "event_update", { title, body, data: { type: "event_update", eventId } });
  } catch (error) {
    console.error("notifyEventRegistrants failed", error);
  }
}
