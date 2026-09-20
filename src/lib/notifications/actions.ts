"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";

// Called directly from the client (not bound to a form) — the notification
// bell polls this on an interval to pick up new requests without a full
// page reload. RLS still scopes results to organizations the caller
// actually belongs to, so this can't be used to peek at another org's feed.
export async function getNotificationsForOrg(organizationId: string) {
  await requireUser();

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(20);

  return data ?? [];
}

export async function markNotificationRead(notificationId: string) {
  await requireUser();

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
}

export async function markAllNotificationsRead(organizationId: string) {
  await requireUser();

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .is("read_at", null);
}

export async function deleteNotification(notificationId: string) {
  await requireUser();

  const supabase = await createClient();
  await supabase.from("notifications").delete().eq("id", notificationId);
}

export async function clearAllNotifications(organizationId: string) {
  await requireUser();

  const supabase = await createClient();
  await supabase.from("notifications").delete().eq("organization_id", organizationId);
}
