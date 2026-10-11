import type { PrayerRequestVisibility } from "@/types/database";

export const MIN_PRAYER_LENGTH = 3;
export const MAX_PRAYER_LENGTH = 1000;
// A member can raise only so many in a day, so the church team isn't
// flooded and the notification stays meaningful.
export const MAX_PRAYER_REQUESTS_PER_DAY = 5;

export interface PrayerRequestInput {
  request: string;
  visibility: PrayerRequestVisibility;
  isAnonymous: boolean;
}

// Reads an untrusted request body into a clean input, or says what's wrong.
export function parsePrayerRequestInput(raw: unknown): { input: PrayerRequestInput; error?: undefined } | { input?: undefined; error: string } {
  if (!raw || typeof raw !== "object") return { error: "Write your prayer request." };
  const body = raw as Record<string, unknown>;

  const request = typeof body.request === "string" ? body.request.trim() : "";
  if (request.length < MIN_PRAYER_LENGTH) return { error: "Write your prayer request." };
  if (request.length > MAX_PRAYER_LENGTH) return { error: `Please keep it under ${MAX_PRAYER_LENGTH} characters.` };

  const visibility: PrayerRequestVisibility = body.visibility === "shared" ? "shared" : "private";
  // Anonymous only means something on the shared wall: a private request is
  // seen by the church team, who need to know who to follow up with.
  const isAnonymous = visibility === "shared" && body.isAnonymous === true;

  return { input: { request, visibility, isAnonymous } };
}

// The short line shown in the team's notification: the request itself would
// be too long (and is sensitive), so just who and how it was shared.
export function prayerNotificationBody(memberName: string, visibility: PrayerRequestVisibility): string {
  return `${memberName} shared a prayer request${visibility === "shared" ? " with the church" : " with the church team"}.`;
}
