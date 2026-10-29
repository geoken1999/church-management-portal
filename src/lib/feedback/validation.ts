export const FEEDBACK_CATEGORIES = ["praise", "idea", "problem", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_SOURCES = ["web", "android", "ios"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const FEEDBACK_LABELS: Record<FeedbackCategory, string> = {
  praise: "Something you like",
  idea: "An idea",
  problem: "A problem",
  other: "Something else",
};

export const MAX_FEEDBACK_MESSAGE = 2000;
/** A person can send this many in a day; more than that is almost certainly a script. */
export const MAX_FEEDBACK_PER_DAY = 10;

export interface CleanFeedback {
  rating: number;
  category: FeedbackCategory;
  message: string;
  screen: string;
  appVersion: string;
  device: string;
}

const cut = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * Turns whatever the web form or the mobile app sent into clean feedback, or the message to show the person.
 * Only a rating is required; a low rating (1–2) needs a few words on what went wrong, so the team can act on it.
 */
export function parseFeedback(raw: unknown): { ok: true; feedback: CleanFeedback } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid request." };
  const body = raw as Record<string, unknown>;
  const rating = Math.round(Number(body.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return { ok: false, error: "Please choose a rating from 1 to 5." };
  const category = (FEEDBACK_CATEGORIES as readonly string[]).includes(body.category as string) ? (body.category as FeedbackCategory) : "other";
  const message = cut(body.message, MAX_FEEDBACK_MESSAGE);
  if (rating <= 2 && message.length < 5) return { ok: false, error: "Please tell us a little about what went wrong." };
  return {
    ok: true,
    feedback: { rating, category, message, screen: cut(body.screen, 80), appVersion: cut(body.appVersion, 40), device: cut(body.device, 80) },
  };
}
