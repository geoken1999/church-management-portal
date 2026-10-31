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
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export const TRASH_DAYS = 30;

/** Designs in the trash. Anything older than TRASH_DAYS is removed for good first. */
export async function getTrashedDesigns(organizationId: string): Promise<(DesignListItem & { deleted_at: string; days_left: number })[]> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString();
  await admin.from("designs").delete().eq("organization_id", organizationId).lt("deleted_at", cutoff);
  const { data } = await admin
    .from("designs")
    .select("id, name, kind, width, height, updated_at, doc, deleted_at")
    .eq("organization_id", organizationId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(200);
  const now = Date.now();
  return (data ?? []).map((d) => ({
    ...d,
    deleted_at: d.deleted_at as string,
    days_left: Math.max(0, TRASH_DAYS - Math.floor((now - new Date(d.deleted_at as string).getTime()) / 86_400_000)),
  }));
}

export async function getDesign(organizationId: string, id: string): Promise<DesignRow | null> {
  const { data } = await createAdminClient().from("designs").select("*").eq("organization_id", organizationId).eq("id", id).is("deleted_at", null).maybeSingle();
  return data ?? null;
}
