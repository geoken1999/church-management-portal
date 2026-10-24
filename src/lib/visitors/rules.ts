// The rules for visitors, with no database or server code so the form, the server and the tests agree.

/** The last 10 digits of a phone number: the same rule as public.phone_key in the database (migration 0215). */
export function phoneKey(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "").slice(-10);
}

export interface VisitInput {
  name: string;
  phone: string;
  email: string;
  prayerRequest: string;
}

export interface VisitErrors {
  name?: string;
  phone?: string;
  email?: string;
  prayerRequest?: string;
}

export const PRAYER_MAX = 1000;
export const FEEDBACK_MAX = 1500;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

export function validateVisit(input: VisitInput): VisitErrors {
  const errors: VisitErrors = {};
  if (input.name.trim().length < 2) errors.name = "Please tell us your name.";
  else if (input.name.trim().length > 80) errors.name = "That name is too long.";
  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) errors.phone = "Enter a mobile number we can reach you on.";
  if (input.email.trim() && !EMAIL.test(input.email.trim())) errors.email = "That email doesn't look right.";
  if (input.prayerRequest.length > PRAYER_MAX) errors.prayerRequest = `Please keep it under ${PRAYER_MAX} characters.`;
  return errors;
}

export interface FeedbackInput {
  rating: number;
  text: string;
  wantsFollowup: boolean | null;
}

export function validateFeedback(input: FeedbackInput): string | null {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return "Please choose a rating from 1 to 5.";
  if (input.text.length > FEEDBACK_MAX) return `Please keep your comments under ${FEEDBACK_MAX} characters.`;
  if (input.wantsFollowup === null) return "Please tell us whether you would like a follow-up.";
  return null;
}

/** The feedback message goes out on the day after the visit (the church's own calendar day), and not for visits long past. */
export function feedbackDue(firstVisitedOn: string, today: string, maxAgeDays = 7): boolean {
  if (firstVisitedOn >= today) return false;
  const age = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${firstVisitedOn}T00:00:00Z`)) / 86_400_000);
  return age <= maxAgeDays;
}

export type VisitorFilter = "all" | "followup" | "awaiting";

export interface VisitorLike {
  wants_followup: boolean | null;
  followed_up_at: string | null;
  feedback_at: string | null;
}

export function filterVisitors<T extends VisitorLike>(visitors: T[], filter: VisitorFilter): T[] {
  if (filter === "followup") return visitors.filter((v) => v.wants_followup === true && !v.followed_up_at);
  if (filter === "awaiting") return visitors.filter((v) => !v.feedback_at);
  return visitors;
}
