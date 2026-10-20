// Pure rules for live classes, so they are testable without a database or a clock.
import { zonedTimeToUtc } from "@/lib/organizations/timezone";

export const SESSION_MODES = [
  { value: "video", label: "Video class" },
  { value: "audio", label: "Audio class" },
] as const;

export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 480;
/** Students can join this long before a class starts. Mirrors lms_join_session in the database. */
export const JOIN_OPENS_MINUTES_BEFORE = 15;
/** The "starts soon" reminder goes out this long before the start. */
export const REMINDER_MINUTES_BEFORE = 10;

export interface SessionInput {
  title: string;
  description: string;
  /** The church's local date and time, "YYYY-MM-DDTHH:mm". */
  startsAtLocal: string;
  durationMinutes: string;
  mode: string;
}

export type SessionErrors = Partial<Record<keyof SessionInput, string>>;

export function validateSession(
  input: SessionInput,
  now: Date,
  timeZone: string,
  { requireFuture }: { requireFuture: boolean },
): SessionErrors {
  const errors: SessionErrors = {};
  const title = input.title.trim();
  if (title.length < 3)
    errors.title = "Give the class a title of at least 3 characters.";
  else if (title.length > 120)
    errors.title = "Keep the title under 120 characters.";
  if (input.description.length > 2000)
    errors.description = "Keep the description under 2000 characters.";
  if (!SESSION_MODES.some((m) => m.value === input.mode))
    errors.mode = "Choose video or audio.";

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.startsAtLocal)) {
    errors.startsAtLocal = "Choose the date and time.";
  } else {
    const start = zonedTimeToUtc(input.startsAtLocal, timeZone);
    if (Number.isNaN(start.getTime()))
      errors.startsAtLocal = "Choose a valid date and time.";
    else if (requireFuture && start.getTime() < now.getTime() - 60_000)
      errors.startsAtLocal = "Choose a time in the future.";
  }

  const minutes = Number(input.durationMinutes);
  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_DURATION_MINUTES ||
    minutes > MAX_DURATION_MINUTES
  ) {
    errors.durationMinutes = `Enter the length in minutes, from ${MIN_DURATION_MINUTES} to ${MAX_DURATION_MINUTES}.`;
  }
  return errors;
}

// A call ends by itself at the plan's limit (null = no limit). Better to refuse a class that would be
// cut off than to let it be.
export function durationProblem(
  minutes: number,
  planLimitMinutes: number | null,
): string | null {
  if (planLimitMinutes === null || minutes <= planLimitMinutes) return null;
  return planLimitMinutes <= 0
    ? "You have no K-Connect minutes left this month. Buy more minutes from the K-Connect page or wait for next month."
    : `You have ${planLimitMinutes} K-Connect minutes left this month. Make the class ${planLimitMinutes} minutes or shorter, or buy more minutes from the K-Connect page.`;
}

export function endsAt(start: Date, durationMinutes: number): Date {
  return new Date(start.getTime() + durationMinutes * 60_000);
}

export function durationMinutes(startsAt: string, endsAtIso: string): number {
  return Math.round(
    (new Date(endsAtIso).getTime() - new Date(startsAt).getTime()) / 60_000,
  );
}

// Whether students can open the class now. Mirrors the database.
export function canJoinNow(
  now: Date,
  session: {
    starts_at: string;
    ends_at: string;
    status: string;
    meeting_id: string | null;
  },
): boolean {
  if (session.status !== "scheduled" || !session.meeting_id) return false;
  return (
    now.getTime() >=
      new Date(session.starts_at).getTime() -
        JOIN_OPENS_MINUTES_BEFORE * 60_000 &&
    now.getTime() <= new Date(session.ends_at).getTime()
  );
}

// Whether a class should get its "starts soon" reminder on this run: it starts within the reminder
// window, has not started more than a few minutes ago, is still scheduled, and was not reminded yet.
// The job runs every 5 minutes, so the reminder arrives 5 to 10 minutes ahead.
export function reminderDue(
  now: Date,
  session: {
    starts_at: string;
    status: string;
    reminder_sent_at: string | null;
  },
): boolean {
  if (session.status !== "scheduled" || session.reminder_sent_at) return false;
  const untilStart = new Date(session.starts_at).getTime() - now.getTime();
  return (
    untilStart <= REMINDER_MINUTES_BEFORE * 60_000 && untilStart > -5 * 60_000
  );
}

// "YYYY-MM-DDTHH:mm" in the given time zone, for a datetime-local field.
export function toLocalInput(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

export function whenText(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const ATTENDANCE_LABELS = {
  present: "Present",
  absent: "Absent",
  excused: "Excused",
} as const;

export function attendanceSummary(
  statuses: ("present" | "absent" | "excused" | null)[],
): { present: number; absent: number; excused: number; unmarked: number } {
  const summary = { present: 0, absent: 0, excused: 0, unmarked: 0 };
  for (const status of statuses) {
    if (status === null) summary.unmarked += 1;
    else summary[status] += 1;
  }
  return summary;
}
