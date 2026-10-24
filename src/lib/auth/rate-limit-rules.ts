// Pure rules for slowing down repeated sign-in guesses; the database side is in rate-limit.ts.

export interface AttemptRule {
  /** What is being limited, e.g. "login". */
  action: string;
  windowMinutes: number;
  /** Failures allowed per email within the window. */
  perEmail: number;
  /** Failures allowed per IP address within the window (higher: offices and churches share an IP). */
  perIp: number;
}

export const LOGIN_RULE: AttemptRule = {
  action: "login",
  windowMinutes: 15,
  perEmail: 5,
  perIp: 30,
};
export const PASSWORD_CHECK_RULE: AttemptRule = {
  action: "password-check",
  windowMinutes: 15,
  perEmail: 5,
  perIp: 30,
};
// Counts every request, not just failures, so it can't be used to flood someone's inbox.
export const PASSWORD_RESET_RULE: AttemptRule = {
  action: "password-reset",
  windowMinutes: 60,
  perEmail: 3,
  perIp: 20,
};

export interface LimitDecision {
  blocked: boolean;
  /** Whole minutes until another attempt is allowed (at least 1 when blocked). */
  retryAfterMinutes: number;
}

// `times` are the attempts inside the window for one key. Blocked once there are `limit` of them,
// until the oldest one that counts falls out of the window.
export function decide(
  times: Date[],
  limit: number,
  windowMinutes: number,
  now: Date,
): LimitDecision {
  const windowMs = windowMinutes * 60_000;
  const recent = times
    .filter((t) => now.getTime() - t.getTime() < windowMs)
    .sort((a, b) => a.getTime() - b.getTime());
  if (recent.length < limit) return { blocked: false, retryAfterMinutes: 0 };
  // The attempt whose expiry brings the count back under the limit.
  const freeing = recent[recent.length - limit];
  const msLeft = freeing.getTime() + windowMs - now.getTime();
  return {
    blocked: true,
    retryAfterMinutes: Math.max(1, Math.ceil(msLeft / 60_000)),
  };
}

export function blockedMessage(minutes: number): string {
  return `Too many attempts. Please try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

// The public account-deletion form: counts every submission so it can't be used to send mail to others.
export const DELETION_FORM_RULE: AttemptRule = { action: "deletion-form", windowMinutes: 60, perEmail: 3, perIp: 10 };

// The public Bible School application form: counts every submission (by phone number and by IP), so it
// can't be used to flood a church's team with notifications.
export const STUDENT_APPLICATION_RULE: AttemptRule = { action: "student-application", windowMinutes: 60, perEmail: 3, perIp: 10 };

// The public visitor form (QR code at church): counts every submission by phone number and by IP. A church shares
// one IP at its service, so the per-IP allowance is generous.
export const VISITOR_FORM_RULE: AttemptRule = { action: "visitor-form", windowMinutes: 60, perEmail: 4, perIp: 60 };
