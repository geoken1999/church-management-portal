"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { setAutoDelete } from "@/lib/retention/settings";

const PATH = "/platform-admin/retention";

// The one switch that lets the daily job delete lapsed churches. Off until a
// platform admin turns it on here.
export async function setAutoDeleteAction(on: boolean): Promise<{ error?: string }> {
  const admin = await requirePlatformAdmin();
  await setAutoDelete(on);
  await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Platform admin (${admin.email ?? "unknown"}) turned automatic deletion of lapsed churches ${on ? "ON" : "OFF"}` });
  revalidatePath(PATH);
  return {};
}

// Keep a church forever: it still gets reminders but is never deleted.
export async function setRetentionExemptAction(organizationId: string, exempt: boolean): Promise<{ error?: string }> {
  const admin = await requirePlatformAdmin();
  const { error } = await createAdminClient().from("organization_retention").update({ exempt, updated_at: new Date().toISOString() }).eq("organization_id", organizationId);
  if (error) return { error: "Couldn't save that." };
  await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Platform admin (${admin.email ?? "unknown"}) ${exempt ? "marked a church to keep forever" : "removed a church's keep-forever mark"}`, organizationId });
  revalidatePath(PATH);
  return {};
}
