import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeInvoiceTemplate, SETTING_KEY, type InvoiceTemplate } from "@/lib/invoices/template";

export async function loadInvoiceTemplate(): Promise<InvoiceTemplate> {
  const { data } = await createAdminClient().from("platform_settings").select("value").eq("key", SETTING_KEY).maybeSingle();
  return normalizeInvoiceTemplate(data?.value);
}

export async function saveInvoiceTemplate(template: InvoiceTemplate): Promise<{ error?: string }> {
  const { error } = await createAdminClient().from("platform_settings").upsert({ key: SETTING_KEY, value: template as unknown as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error ? { error: "Couldn't save the template." } : {};
}
