import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { SETTING_KEY, parseConfig, type UpdateConfig } from "@/lib/mobile/update-config";

export async function getUpdateConfig(): Promise<UpdateConfig> {
  const { data } = await createAdminClient().from("platform_settings").select("value").eq("key", SETTING_KEY).maybeSingle();
  return parseConfig(data?.value);
}

export async function saveUpdateConfig(config: UpdateConfig): Promise<string | null> {
  const { error } = await createAdminClient()
    .from("platform_settings")
    .upsert({ key: SETTING_KEY, value: config as unknown as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error ? error.message : null;
}
