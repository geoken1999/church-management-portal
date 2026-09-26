import "server-only";

// A standalone builder rather than reusing src/lib/todos/ics.ts's private
// helpers — that file's buildTodoIcs is a single point-in-time VALARM
// reminder with no end time or location, while an event needs DTEND and
// LOCATION; close enough in shape to share the low-level RFC 5545 escaping
// but different enough in what fields apply that keeping them separate
// avoids threading todo-specific assumptions into an event's ICS (and
// vice versa).

// RFC 5545 requires literal backslashes, commas, semicolons, and newlines
// inside text values to be escaped — without this, a title/description
// containing any of those characters would produce a malformed .ics file
// that calendar apps silently fail to import.
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// UTC format: YYYYMMDDTHHMMSSZ.
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

export function buildEventRegistrationIcs(input: {
  eventId: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  location: string | null;
}): string {
  const start = new Date(input.startAt);
  // A calendar entry needs *some* end time — an hour is a reasonable
  // default for whatever event didn't set one explicitly, same fallback
  // duration used elsewhere for a "no end time given" event.
  const end = input.endAt ? new Date(input.endAt) : new Date(start.getTime() + 60 * 60 * 1000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KingdomFlow//Event Registration//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${input.eventId}@kingdomflow.app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    ...(input.description ? [`DESCRIPTION:${escapeIcsText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
