import "server-only";

import type { Todo } from "@/types/database";

// RFC 5545 requires literal backslashes, commas, semicolons, and newlines
// inside text values to be escaped — without this, a title/description
// containing any of those characters would produce a malformed .ics file
// that calendar apps silently fail to import.
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// UTC "floating" format: YYYYMMDDTHHMMSSZ.
function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Folds long lines per RFC 5545 (max 75 octets per line, continuation
// lines start with a single space) — most calendar apps tolerate long
// lines, but folding is cheap insurance against the strict ones.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

export function buildTodoIcs(todo: Todo): string {
  const dueAt = todo.due_at ? new Date(todo.due_at) : new Date();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KingdomFlow//To Do//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:todo-${todo.id}@kingdomflow.app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(dueAt)}`,
    `SUMMARY:${escapeIcsText(todo.title)}`,
    ...(todo.description ? [`DESCRIPTION:${escapeIcsText(todo.description)}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "TRIGGER:-PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
