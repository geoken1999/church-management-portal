import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

// Whether a church may use the Bible School, and whether it has asked. Like live streaming, it is set
// up per church on request: the team turns it on (migration 0196).
export const getBibleSchoolAccess = cache(
  async (
    organizationId: string,
  ): Promise<{
    enabled: boolean;
    requestedAt: string | null;
    note: string | null;
    enabledAt: string | null;
  }> => {
    const { data } = await createAdminClient()
      .from("bible_school_access")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();
    return {
      enabled: data?.enabled ?? false,
      requestedAt: data?.requested_at ?? null,
      note: data?.note ?? null,
      enabledAt: data?.enabled_at ?? null,
    };
  },
);

export async function isBibleSchoolEnabled(
  organizationId: string,
): Promise<boolean> {
  return (await getBibleSchoolAccess(organizationId)).enabled;
}

export const BIBLE_SCHOOL_NOT_ENABLED =
  'The Bible School isn\'t turned on for your church yet. Use "Contact us to enable" on the Bible School page.';
