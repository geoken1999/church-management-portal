import type { EventRecurrenceFrequency } from "@/types/database";

export const RECURRENCE_FREQUENCIES: EventRecurrenceFrequency[] = ["daily", "weekly", "monthly", "yearly"];

export interface EventFieldErrors {
  title?: string;
  startAt?: string;
  endAt?: string;
  recurrenceFrequency?: string;
  recurrenceEndDate?: string;
  meetingLink?: string;
}

export function validateEvent(input: {
  title: string;
  startAt: string;
  endAt: string;
  isRecurring: boolean;
  recurrenceFrequency: string;
  recurrenceEndDate: string;
  meetingMode: string;
  meetingLink: string;
}): EventFieldErrors {
  const errors: EventFieldErrors = {};

  if (!input.title.trim()) {
    errors.title = "Title is required.";
  } else if (input.title.trim().length < 2) {
    errors.title = "Title must be at least 2 characters.";
  }

  const start = input.startAt ? new Date(input.startAt) : null;
  if (!start || Number.isNaN(start.getTime())) {
    errors.startAt = "Pick a date and time.";
  }

  if (input.endAt) {
    const end = new Date(input.endAt);
    if (Number.isNaN(end.getTime())) {
      errors.endAt = "That end time isn't valid.";
    } else if (start && !Number.isNaN(start.getTime()) && end < start) {
      errors.endAt = "End time must be after the start time.";
    }
  }

  if (input.isRecurring) {
    if (!RECURRENCE_FREQUENCIES.includes(input.recurrenceFrequency as EventRecurrenceFrequency)) {
      errors.recurrenceFrequency = "Choose how often this repeats.";
    }
    if (input.recurrenceEndDate) {
      const recurrenceEnd = new Date(`${input.recurrenceEndDate}T00:00:00`);
      if (Number.isNaN(recurrenceEnd.getTime())) {
        errors.recurrenceEndDate = "That end date isn't valid.";
      } else if (start && !Number.isNaN(start.getTime()) && recurrenceEnd < start) {
        errors.recurrenceEndDate = "Must be on or after the start date.";
      }
    }
  }

  if (input.meetingMode === "online" && input.meetingLink) {
    if (!/^https?:\/\//i.test(input.meetingLink.trim())) {
      errors.meetingLink = "Enter a full link starting with http:// or https://.";
    }
  }

  return errors;
}
