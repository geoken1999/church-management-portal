import type { Dictionary } from "@/lib/i18n/dictionary";

type NavGroupKey = keyof Dictionary["nav"]["groups"];
type NavItemKey = keyof Dictionary["nav"]["items"];

// The pool an owner/admin picks up to MOBILE_FEATURE_LIMIT from on
// /dashboard/mobile. Mirrors NAV_GROUPS in
// src/components/dashboard/DashboardShell.tsx group-for-group and
// item-for-item (labels come from the same t.nav.groups/t.nav.items i18n
// keys) — kept as a separate plain-data list, the same way the i18n
// dictionaries already duplicate this taxonomy independently of
// DashboardShell, rather than importing a "use client" component file into
// this server-side module. Keep all three in sync when the nav changes;
// the DB also enforces this exact key list (migration 0084).
export const MOBILE_FEATURE_LIMIT = 15;

export const MOBILE_FEATURE_GROUPS: { groupKey: NavGroupKey; itemKeys: NavItemKey[] }[] = [
  { groupKey: "overview", itemKeys: ["dashboard"] },
  { groupKey: "organization", itemKeys: ["profile", "team", "billing", "branches"] },
  { groupKey: "people", itemKeys: ["members", "leaders", "youth", "committee", "families"] },
  { groupKey: "ministry", itemKeys: ["ministries", "worship", "media", "events", "todos"] },
  { groupKey: "tools", itemKeys: ["planner", "forms", "folder", "attendance", "reports", "widget", "accounting"] },
  { groupKey: "finance", itemKeys: ["fundraisers", "offerings", "donations"] },
  { groupKey: "messaging", itemKeys: ["email", "sms", "whatsapp"] },
  { groupKey: "socialMedia", itemKeys: ["instagram", "youtube", "facebook"] },
  { groupKey: "help", itemKeys: ["documentation", "support"] },
];

export const VALID_MOBILE_FEATURE_KEYS: string[] = MOBILE_FEATURE_GROUPS.flatMap((g) => g.itemKeys);
