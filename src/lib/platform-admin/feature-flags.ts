import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { TAB_KEYS, type TabKey } from "@/lib/permissions/tabs";

// A tab with no row in platform_feature_flags is enabled by default
// (missing = enabled, not missing = disabled) — that way adding a new
// TabKey never silently disables it until a platform admin explicitly
// turns it off. Read via the admin client regardless of caller, same as
// getPlanAccess's own read of organization_subscriptions: "platform admin"
// is an email allowlist, not something RLS can evaluate, so there's no
// policy for a user-session client to succeed against anyway.
export const getDisabledFeatures = cache(async (): Promise<Set<TabKey>> => {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_feature_flags").select("tab_key").eq("enabled", false);
  return new Set((data ?? []).map((row) => row.tab_key as TabKey));
});

export interface FeatureFlagRow {
  tab: TabKey;
  enabled: boolean;
  updatedAt: string | null;
}

// For the platform-admin feature-flags page — every tab, in TAB_KEYS
// order, with its current state.
export const getAllFeatureFlags = cache(async (): Promise<FeatureFlagRow[]> => {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_feature_flags").select("tab_key, enabled, updated_at");
  const byTab = new Map((data ?? []).map((row) => [row.tab_key as TabKey, row]));

  return TAB_KEYS.map((tab) => {
    const row = byTab.get(tab);
    return { tab, enabled: row?.enabled ?? true, updatedAt: row?.updated_at ?? null };
  });
});
