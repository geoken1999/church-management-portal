import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PlatformInvoice } from "@/types/database";

// A church's own KingdomFlow invoices, newest first (an owner or admin can read them).
export async function getOrganizationInvoices(organizationId: string): Promise<PlatformInvoice[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_invoices").select("*").eq("organization_id", organizationId).order("issued_at", { ascending: false }).limit(100);
  return (data ?? []) as PlatformInvoice[];
}
