"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";

export interface ListingResult {
  error?: string;
  success?: boolean;
}

// Super Admin: show a church on the landing page, or take it off again.
export async function setLandingListedAction(
  organizationId: string,
  listed: boolean,
): Promise<ListingResult> {
  await requirePlatformAdmin();
  const { data, error } = await createAdminClient()
    .from("organizations")
    .update({ landing_listed: listed })
    .eq("id", organizationId)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return {
      error:
        "Couldn't save that. Check that the landing page migration has been applied.",
    };
  revalidatePath("/");
  revalidatePath(`/platform-admin/tenants/${organizationId}`);
  return { success: true };
}
