import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const KEY = "retention_auto_delete";

// The platform admin's switch for automatic deletion. It starts off: until someone
// turns it on, the daily job only sends reminders and never deletes anything.
export async function isAutoDeleteOn(): Promise<boolean> {
  const { data } = await createAdminClient().from("platform_settings").select("value").eq("key", KEY).maybeSingle();
  return data?.value === true;
}

export async function setAutoDelete(on: boolean): Promise<void> {
  await createAdminClient().from("platform_settings").upsert({ key: KEY, value: on, updated_at: new Date().toISOString() }, { onConflict: "key" });
}
