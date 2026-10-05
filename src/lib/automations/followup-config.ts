// Settings for a Member follow-up automation, stored in automations.config.
// Pure (no server imports) so the wizard and the engine validate the same way.

import type { TodoPriority } from "@/types/database";
import { isWithinConsecutiveRange } from "@/lib/automations/followup-eligibility";

export const FOLLOWUP_PRIORITIES: TodoPriority[] = ["low", "normal", "high"];

export interface FollowupConfig {
  // Recorded Sundays in a row a member must be absent from. 2 to 12.
  requiredConsecutive: number;
  // Day of the week the check runs, 0 = Sunday ... 6 = Saturday, in the
  // organization's timezone. Monday is the default: the Sunday just ended
  // has been recorded by then.
  runWeekday: number;
  // null means every branch the organization has.
  branchIds: string[] | null;
  // Auth user who receives the tasks. Must be an active member of the org.
  assigneeUserId: string;
  // Working days (Mon-Fri) from task creation to its due date.
  dueWorkingDays: number;
  priority: TodoPriority;
}

export interface FollowupConfigErrors {
  requiredConsecutive?: string;
  runWeekday?: string;
  assigneeUserId?: string;
  dueWorkingDays?: string;
  priority?: string;
}

export function readFollowupConfig(raw: Record<string, unknown>): FollowupConfig | null {
  if (typeof raw.requiredConsecutive !== "number") return null;
  if (typeof raw.runWeekday !== "number") return null;
  if (typeof raw.assigneeUserId !== "string") return null;
  if (typeof raw.dueWorkingDays !== "number") return null;
  const priority = FOLLOWUP_PRIORITIES.includes(raw.priority as TodoPriority) ? (raw.priority as TodoPriority) : "normal";
  const branchIds = Array.isArray(raw.branchIds) && raw.branchIds.every((id) => typeof id === "string") ? (raw.branchIds as string[]) : null;
  return {
    requiredConsecutive: raw.requiredConsecutive,
    runWeekday: raw.runWeekday,
    branchIds,
    assigneeUserId: raw.assigneeUserId,
    dueWorkingDays: raw.dueWorkingDays,
    priority,
  };
}

// Validates a config submitted from the wizard. Ids are checked against the
// organization on the server before this is called.
export function validateFollowupConfig(input: {
  requiredConsecutive: number;
  runWeekday: number;
  assigneeUserId: string;
  dueWorkingDays: number;
  priority: string;
}): FollowupConfigErrors {
  const errors: FollowupConfigErrors = {};
  if (!isWithinConsecutiveRange(input.requiredConsecutive)) {
    errors.requiredConsecutive = "Choose between 2 and 12 Sundays.";
  }
  if (!Number.isInteger(input.runWeekday) || input.runWeekday < 0 || input.runWeekday > 6) {
    errors.runWeekday = "Choose a day of the week.";
  }
  if (!input.assigneeUserId) {
    errors.assigneeUserId = "Choose who receives the follow-up tasks.";
  }
  if (!Number.isInteger(input.dueWorkingDays) || input.dueWorkingDays < 0 || input.dueWorkingDays > 14) {
    errors.dueWorkingDays = "Choose between 0 and 14 working days.";
  }
  if (!FOLLOWUP_PRIORITIES.includes(input.priority as TodoPriority)) {
    errors.priority = "Choose a priority.";
  }
  return errors;
}
