// When a church that has lost access is reminded, warned and deleted. Pure, so the
// daily job, the admin page and the tests agree.

/** Days after access ends that the church's account and data are deleted. */
export const RETENTION_DAYS = 30;
/** A reminder to resubscribe goes out this often. */
export const REMINDER_INTERVAL_DAYS = 7;
/** The final warning goes out this many days before deletion. */
export const FINAL_WARNING_DAYS_BEFORE = 1;
/** Deletion waits at least this long after the final warning, so it is really a day's notice. */
export const MIN_HOURS_AFTER_FINAL_WARNING = 22;

const DAY_MS = 86_400_000;

export interface RetentionState {
  expiredSince: Date;
  remindersSent: number;
  finalWarningSentAt: Date | null;
}

export type RetentionAction = "reminder" | "final_warning" | "delete" | "wait";

export function daysSince(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

export function deletionDate(expiredSince: Date): Date {
  return new Date(expiredSince.getTime() + RETENTION_DAYS * DAY_MS);
}

/**
 * What to do for a church today. Reminders go out on day 0, 7, 14 and 21; the final
 * warning on day 29; deletion on day 30 or later, and only once the final warning has
 * been out for about a day (so a missed run never deletes without notice).
 */
export function nextAction(state: RetentionState, now: Date): RetentionAction {
  const day = daysSince(state.expiredSince, now);
  const finalDay = RETENTION_DAYS - FINAL_WARNING_DAYS_BEFORE;

  if (day >= RETENTION_DAYS) {
    if (!state.finalWarningSentAt) return "final_warning";
    const hoursSince = (now.getTime() - state.finalWarningSentAt.getTime()) / 3_600_000;
    return hoursSince >= MIN_HOURS_AFTER_FINAL_WARNING ? "delete" : "wait";
  }
  if (day >= finalDay) return state.finalWarningSentAt ? "wait" : "final_warning";

  // The last reminder is a full interval before the final warning, so the two never
  // arrive back to back.
  if (day > finalDay - REMINDER_INTERVAL_DAYS) return "wait";
  const remindersDue = Math.floor(day / REMINDER_INTERVAL_DAYS) + 1;
  return state.remindersSent < remindersDue ? "reminder" : "wait";
}

export interface SubscriptionLike {
  status: string;
  current_end: string | null;
  updated_at: string;
}

/**
 * When a church's access ended, or null if it still has access. Access is a paid
 * subscription that is active, or a free trial that hasn't run out (same rule as the
 * app's plan check). For a church whose subscription ended, it is the later of the
 * trial's end and the subscription's end.
 */
export function accessEndedAt(trialEndsAt: Date | null, subscription: SubscriptionLike | null, now: Date): Date | null {
  if (subscription?.status === "active") return null;
  const candidates: Date[] = [];
  if (trialEndsAt) candidates.push(trialEndsAt);
  if (subscription && ["cancelled", "halted", "completed", "expired"].includes(subscription.status)) {
    candidates.push(new Date(subscription.current_end ?? subscription.updated_at));
  }
  if (candidates.length === 0) return null;
  const endedAt = new Date(Math.max(...candidates.map((d) => d.getTime())));
  return endedAt.getTime() <= now.getTime() ? endedAt : null;
}
