import { describe, expect, it } from "vitest";
import { reminderFor, reminderText, type ReminderTodo } from "@/lib/todos/reminders";

const base: ReminderTodo = { dueKey: "2026-10-14", overdue: false, remindDayBefore: false, remindDueDay: true, lastDueReminderKey: null, lastDayBeforeKey: null };
const today = "2026-10-13";
const tomorrow = "2026-10-14";

describe("reminderFor", () => {
  it("reminds the day before only when asked", () => {
    expect(reminderFor(base, today, tomorrow)).toBeNull();
    expect(reminderFor({ ...base, remindDayBefore: true }, today, tomorrow)).toBe("day_before");
  });
  it("sends the day-before reminder once", () => {
    expect(reminderFor({ ...base, remindDayBefore: true, lastDayBeforeKey: today }, today, tomorrow)).toBeNull();
  });
  it("reminds on the due day, once", () => {
    const due = { ...base, dueKey: today };
    expect(reminderFor(due, today, tomorrow)).toBe("due_day");
    expect(reminderFor({ ...due, lastDueReminderKey: today }, today, tomorrow)).toBeNull();
  });
  it("keeps reminding while overdue, once a day", () => {
    const late = { ...base, dueKey: "2026-10-10", overdue: true };
    expect(reminderFor(late, today, tomorrow)).toBe("overdue");
    expect(reminderFor({ ...late, lastDueReminderKey: today }, today, tomorrow)).toBeNull();
  });
  it("stays quiet when the due-day reminder is turned off", () => {
    expect(reminderFor({ ...base, dueKey: today, remindDueDay: false }, today, tomorrow)).toBeNull();
    expect(reminderFor({ ...base, dueKey: "2026-10-10", overdue: true, remindDueDay: false }, today, tomorrow)).toBeNull();
  });
  it("words each reminder", () => {
    expect(reminderText("day_before")).toBe("To-do due tomorrow");
  });
});
