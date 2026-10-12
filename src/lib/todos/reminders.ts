// Which reminder, if any, a to-do is due for right now. Pure, so the rules are
// testable; the daily cron route supplies the dates (each in the church's own
// timezone) and sends what this decides.

export interface ReminderTodo {
  dueKey: string; // the due date, "YYYY-MM-DD", in the church's timezone
  overdue: boolean;
  remindDayBefore: boolean;
  remindDueDay: boolean;
  lastDueReminderKey: string | null; // the day (church timezone) the due-day/overdue reminder last went out
  lastDayBeforeKey: string | null; // the day the day-before reminder last went out
}

export type ReminderKind = "day_before" | "due_day" | "overdue";

export function reminderFor(todo: ReminderTodo, todayKey: string, tomorrowKey: string): ReminderKind | null {
  if (todo.remindDayBefore && todo.dueKey === tomorrowKey && todo.lastDayBeforeKey !== todayKey) return "day_before";
  if (todo.remindDueDay && todo.lastDueReminderKey !== todayKey) {
    if (todo.overdue) return "overdue";
    if (todo.dueKey === todayKey) return "due_day";
  }
  return null;
}

export function reminderText(kind: ReminderKind): string {
  switch (kind) {
    case "day_before":
      return "To-do due tomorrow";
    case "due_day":
      return "To-do due today";
    case "overdue":
      return "To-do overdue";
  }
}
