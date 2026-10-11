import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { TAB_KEYS, type TabKey } from "@/lib/permissions/tabs";
import { defaultStatusFor, featureTag, isFeatureStatus, isFeatureUnavailable, type FeatureStatus, type FeatureTag } from "@/lib/platform-admin/feature-status";

// A tab with no row in platform_feature_flags gets defaultStatusFor(tab):
// live for the modules that existed before the testing rule, testing for any
// added since, so a newly added TabKey reaches only the test users until a
// platform admin moves it to Beta or Live. Read via the admin client
// regardless of caller, same as getPlanAccess's own read of
// organization_subscriptions: "platform admin" is an email allowlist, not
// something RLS can evaluate, so there's no policy for a user-session client
// to succeed against anyway.
interface FeatureState {
  status: FeatureStatus;
  newUntil: string | null;
  updatedAt: string | null;
}

const getFeatureStates = cache(async (): Promise<Map<TabKey, FeatureState>> => {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_feature_flags").select("tab_key, status, enabled, new_until, updated_at");
  const states = new Map<TabKey, FeatureState>();
  for (const row of data ?? []) {
    // `status` is the source of truth; `enabled = false` still counts as off
    // for a row written before statuses existed.
    const status: FeatureStatus = !row.enabled ? "off" : isFeatureStatus(row.status) ? row.status : "live";
    states.set(row.tab_key as TabKey, { status, newUntil: row.new_until, updatedAt: row.updated_at });
  }
  return states;
});

// The tabs this user can't use right now: those that are off for everyone,
// and those still in testing when the user isn't a test user.
export const getDisabledFeatures = cache(async (userEmail?: string | null): Promise<Set<TabKey>> => {
  const states = await getFeatureStates();
  const blocked = new Set<TabKey>();
  for (const tab of TAB_KEYS) {
    const status = states.get(tab)?.status ?? defaultStatusFor(tab);
    if (isFeatureUnavailable(status, userEmail)) blocked.add(tab);
  }
  return blocked;
});

// Small labels ("Beta", "New", "Testing") to show beside modules in the menu.
export const getFeatureTags = cache(async (): Promise<Partial<Record<TabKey, FeatureTag>>> => {
  const states = await getFeatureStates();
  const now = new Date();
  const tags: Partial<Record<TabKey, FeatureTag>> = {};
  for (const tab of TAB_KEYS) {
    const state = states.get(tab);
    const tag = featureTag(state?.status ?? defaultStatusFor(tab), state?.newUntil ?? null, now);
    if (tag) tags[tab] = tag;
  }
  return tags;
});

export interface FeatureFlagRow {
  tab: TabKey;
  status: FeatureStatus;
  newUntil: string | null;
  updatedAt: string | null;
}

// For the platform-admin feature-flags page — every tab, in TAB_KEYS
// order, with its current status.
export const getAllFeatureFlags = cache(async (): Promise<FeatureFlagRow[]> => {
  const states = await getFeatureStates();
  return TAB_KEYS.map((tab) => {
    const state = states.get(tab);
    return { tab, status: state?.status ?? defaultStatusFor(tab), newUntil: state?.newUntil ?? null, updatedAt: state?.updatedAt ?? null };
  });
});
