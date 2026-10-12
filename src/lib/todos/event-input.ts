// Reading a to-do event's name and date from a request. Pure, so it is testable.

export function parseTodoEvent(titleRaw: string, dateRaw: string): { title: string; date: string | null } | { error: string } {
  const title = titleRaw.trim();
  if (title.length < 2) return { error: "Give the event a name (at least 2 characters)." };
  if (title.length > 80) return { error: "Keep the event name under 80 characters." };
  const date = dateRaw.trim();
  if (!date) return { title, date: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: "That date isn't valid." };
  return { title, date };
}
