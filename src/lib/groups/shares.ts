// The groups a church can share things with, and the rules for a shared
// post. Pure, so the admin panel, the server actions and the tests agree.
import type { TabKey } from "@/lib/permissions/tabs";

export const GROUP_KEYS = ["leaders", "youth", "worship", "media", "committee"] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export const GROUP_LABELS: Record<GroupKey, string> = {
  leaders: "Leaders",
  youth: "Youth",
  worship: "Worship team",
  media: "Media team",
  committee: "Committee",
};

// The tab whose permission lets someone share with that group.
export const GROUP_TAB: Record<GroupKey, TabKey> = {
  leaders: "leaders",
  youth: "youth",
  worship: "worship",
  media: "media",
  committee: "committee",
};

export function isGroupKey(value: unknown): value is GroupKey {
  return typeof value === "string" && (GROUP_KEYS as readonly string[]).includes(value);
}

export interface GroupPostInput {
  title: string;
  body: string | null;
  linkUrl: string | null;
}

export function parseGroupPost(raw: { title: unknown; body: unknown; linkUrl: unknown }): { post: GroupPostInput; error?: undefined } | { post?: undefined; error: string } {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length < 2) return { error: "Give it a title (at least 2 characters)." };
  if (title.length > 80) return { error: "Keep the title under 80 characters." };

  const body = typeof raw.body === "string" && raw.body.trim() ? raw.body.trim() : null;
  if (body && body.length > 2000) return { error: "Keep the message under 2000 characters." };

  const linkUrl = typeof raw.linkUrl === "string" && raw.linkUrl.trim() ? raw.linkUrl.trim() : null;
  if (linkUrl) {
    try {
      if (new URL(linkUrl).protocol !== "https:") return { error: "The link must start with https://." };
    } catch {
      return { error: "That link isn't valid." };
    }
  }

  if (!body && !linkUrl) return { error: "Add a message or a link." };
  return { post: { title, body, linkUrl } };
}
