import type { TabAccess, TabPermissions } from "@/types/database";

// The data-module tabs a "member"-role user's access can be restricted on.
// Team and Profile are deliberately excluded — they're account-level
// (managing logins, changing your own password), not organization data.
export const TAB_KEYS = [
  "branches",
  "members",
  "leaders",
  "youth",
  "committee",
  "ministries",
  "worship",
  "media",
  "events",
  "todos",
  "forms",
  "fundraisers",
  "offerings",
  "donations",
  "email",
  "sms",
  "instagram",
  "youtube",
  "facebook",
] as const;

export type TabKey = (typeof TAB_KEYS)[number];

export const TAB_LABELS: Record<TabKey, string> = {
  branches: "Branches",
  members: "Members",
  leaders: "Leaders",
  youth: "Youth",
  committee: "Committee",
  ministries: "Ministries",
  worship: "Worship",
  media: "Media",
  events: "Events",
  todos: "To Do",
  forms: "Forms",
  fundraisers: "Fund Raiser",
  offerings: "Offering",
  donations: "Donation",
  email: "Email",
  sms: "SMS",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
};

export function fullTabAccess(): TabAccess {
  return { read: true, write: true, delete: true };
}

export function readOnlyTabAccess(): TabAccess {
  return { read: true, write: false, delete: false };
}

export function noTabAccess(): TabAccess {
  return { read: false, write: false, delete: false };
}

// Owner/admin ignore tab_permissions entirely and always get full access —
// see organizations/dal.ts.
export function allFullTabAccess(): Record<TabKey, TabAccess> {
  return Object.fromEntries(TAB_KEYS.map((key) => [key, fullTabAccess()])) as Record<TabKey, TabAccess>;
}

// The starting point for a newly-created "member" login, and the fallback
// for any tab missing from a stored tab_permissions value — whether because
// the row predates this feature (null) or because the tab was added after
// the row was last saved. Read-only by design: a plain member's access
// only ever grows when an admin explicitly grants it, including for tabs
// that don't exist yet.
export function defaultMemberTabPermissions(): Record<TabKey, TabAccess> {
  return Object.fromEntries(TAB_KEYS.map((key) => [key, readOnlyTabAccess()])) as Record<TabKey, TabAccess>;
}

export function normalizeTabPermissions(raw: TabPermissions | null | undefined): Record<TabKey, TabAccess> {
  const result = defaultMemberTabPermissions();
  if (!raw) return result;

  for (const key of TAB_KEYS) {
    const value = raw[key];
    if (value && typeof value === "object") {
      result[key] = {
        read: Boolean(value.read),
        write: Boolean(value.write),
        delete: Boolean(value.delete),
      };
    }
  }
  return result;
}
