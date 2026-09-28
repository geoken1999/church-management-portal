import type { PlanStatus } from "@/types/database";

export interface PlanFieldErrors {
  title?: string;
  targetDate?: string;
}

export const PLAN_STATUSES: PlanStatus[] = ["draft", "active", "completed"];

export function validatePlan(input: { title: string; targetDate: string }): PlanFieldErrors {
  const errors: PlanFieldErrors = {};

  if (!input.title.trim()) {
    errors.title = "Title is required.";
  } else if (input.title.trim().length < 2) {
    errors.title = "Title must be at least 2 characters.";
  }

  if (input.targetDate && Number.isNaN(new Date(input.targetDate).getTime())) {
    errors.targetDate = "Enter a valid date.";
  }

  return errors;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// A bare "HH:MM" time-of-day, not a full datetime — validated as a plain
// string comparison (zero-padded 24-hour values sort/compare correctly as
// strings, no Date parsing needed).
export function validateItemTimeRange(startTime: string, endTime: string): string | null {
  if (startTime && !TIME_RE.test(startTime)) return "Enter a valid start time.";
  if (endTime && !TIME_RE.test(endTime)) return "Enter a valid end time.";
  if (startTime && endTime && endTime <= startTime) return "End time must be after the start time.";
  return null;
}
