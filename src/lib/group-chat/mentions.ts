// Finding the @mentions in a message so they can be shown as highlighted names, the way chat apps do. A mention is
// the text "@" followed by a participant's full name, exactly as the picker inserts it.

export interface MentionTarget {
  id: string;
  name: string;
}

export interface BodySegment {
  text: string;
  mention: boolean;
  /** A mention of the person reading. */
  me: boolean;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits a message into plain text and mentions of the given people (longest names first, so "Ann Lee" wins over "Ann"). */
export function splitMentions(body: string, targets: MentionTarget[], myId?: string | null): BodySegment[] {
  const people = targets.filter((t) => t.name.trim().length > 0).sort((a, b) => b.name.length - a.name.length);
  if (!body || people.length === 0) return [{ text: body, mention: false, me: false }];
  const pattern = new RegExp(`@(${people.map((p) => escape(p.name)).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  const byName = new Map(people.map((p) => [p.name, p.id]));
  const out: BodySegment[] = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ text: body.slice(last, start), mention: false, me: false });
    out.push({ text: match[0], mention: true, me: Boolean(myId) && byName.get(match[1]) === myId });
    last = start + match[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false, me: false });
  return out.length > 0 ? out : [{ text: body, mention: false, me: false }];
}

/** The text after the last "@" the person is typing, or null when they are not typing a mention. */
export function mentionQueryAt(text: string, cursor: number): string | null {
  const before = text.slice(0, Math.max(0, Math.min(cursor, text.length)));
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
  return match ? match[1] : null;
}

/** The text with the half-typed "@que" before the cursor replaced by "@Full Name ", and where the cursor goes. */
export function insertMention(text: string, cursor: number, name: string): { text: string; cursor: number } {
  const at = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, at).replace(/@[^\s@]*$/, `@${name} `);
  return { text: before + text.slice(at), cursor: before.length };
}
