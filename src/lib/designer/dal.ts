import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { DesignRow } from "@/types/database";

// Designs have no row-level policies (they can carry large embedded pictures), so these reads use the server
// client. Every caller has already checked the person's Media access.

export type DesignListItem = Pick<DesignRow, "id" | "name" | "kind" | "width" | "height" | "updated_at"> & { doc: DesignRow["doc"] };

export async function getDesigns(organizationId: string): Promise<DesignListItem[]> {
  const { data } = await createAdminClient()
    .from("designs")
    .select("id, name, kind, width, height, updated_at, doc")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function getDesign(organizationId: string, id: string): Promise<DesignRow | null> {
  const { data } = await createAdminClient().from("designs").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  return data ?? null;
}
