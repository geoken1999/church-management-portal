import "server-only";

import { createClient } from "@/lib/supabase/server";

export type SocialPlatform = "instagram" | "youtube" | "facebook";

export interface LinkedSocialAccount {
  platform: SocialPlatform;
  accountName: string;
  pictureUrl: string | null;
  isActive: boolean;
}

// Which social accounts this church has linked, for any member to see. Read
// through the database function, so the access tokens are never returned.
export async function getLinkedSocialAccounts(organizationId: string): Promise<LinkedSocialAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("organization_social_accounts", { p_organization_id: organizationId });
  return (data ?? []).map((row) => ({
    platform: row.platform as SocialPlatform,
    accountName: row.account_name,
    pictureUrl: row.picture_url,
    isActive: row.is_active,
  }));
}
