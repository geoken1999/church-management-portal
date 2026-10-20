import { dateKeyInTimezone } from "@/lib/organizations/timezone";
import type { EventStatus } from "@/types/database";

interface EventTimes {
  start_at: string;
  end_at: string | null;
  is_recurring: boolean;
  recurrence_end_date: string | null;
  status: EventStatus | null;
}

// Whether an event's date has passed, in the church's own timezone:
// - a one-off event with an end time is over once that time has passed;
// - a one-off event with no end time is over once its day has passed;
// - a recurring event never ends on its own, only after its recurrence
//   end date (if it has one) has passed.
export function hasEventEnded(
  event: Omit<EventTimes, "status">,
  now: Date,
  timeZone: string,
): boolean {
  if (event.is_recurring) {
    return (
      Boolean(event.recurrence_end_date) &&
      dateKeyInTimezone(now, timeZone) > (event.recurrence_end_date as string)
    );
  }
  if (event.end_at) return now.getTime() > new Date(event.end_at).getTime();
  return (
    dateKeyInTimezone(now, timeZone) >
    dateKeyInTimezone(new Date(event.start_at), timeZone)
  );
}

// The status to show and file an event under: a cancelled event stays
// cancelled, and any other event whose date has passed counts as completed
// without anyone having to mark it. (A daily job also saves that to the
// event itself; see /api/cron/event-status.)
export function effectiveEventStatus(
  event: EventTimes,
  now: Date,
  timeZone: string,
): EventStatus {
  const status = event.status ?? "active";
  if (status === "cancelled" || status === "completed") return status;
  return hasEventEnded(event, now, timeZone) ? "completed" : status;
}
