// What changed on an event, in words for a push notification. Pure, so the
// rule is testable. Returns null when nothing a registrant cares about changed
// (a typo fix in the description, say, should not buzz anyone's phone).

export interface EventSnapshot {
  title: string;
  start_at: string;
  end_at: string | null;
  venue: string | null;
  meeting_link: string | null;
  status: string;
}

export function describeEventChange(
  before: EventSnapshot,
  after: EventSnapshot,
): { headline: string; detail: string } | null {
  if (before.status !== "cancelled" && after.status === "cancelled") {
    return {
      headline: "Event cancelled",
      detail: `${after.title} has been cancelled.`,
    };
  }
  if (after.status === "cancelled") return null;

  const changes: string[] = [];
  if (
    new Date(before.start_at).getTime() !==
      new Date(after.start_at).getTime() ||
    (before.end_at ?? "") !== (after.end_at ?? "")
  )
    changes.push("the time");
  if ((before.venue ?? "") !== (after.venue ?? "")) changes.push("the venue");
  if ((before.meeting_link ?? "") !== (after.meeting_link ?? ""))
    changes.push("the online link");
  if (before.title !== after.title) changes.push("the name");
  if (changes.length === 0) return null;

  const list =
    changes.length === 1
      ? changes[0]
      : `${changes.slice(0, -1).join(", ")} and ${changes[changes.length - 1]}`;
  return {
    headline: "Event updated",
    detail: `${after.title}: ${list} changed. Open the app to see the details.`,
  };
}

// Which members registered for an event, matched by the email or phone they
// registered with (the last 10 digits of a phone, as elsewhere).
export interface RegistrantContact {
  email: string | null;
  phone: string | null;
}
export interface MemberContact {
  auth_user_id: string | null;
  email: string | null;
  phone: string | null;
}

function tail(phone: string | null): string {
  return (phone ?? "").replace(/\D/g, "").slice(-10);
}

export function matchRegistrantsToAuthIds(
  registrants: RegistrantContact[],
  members: MemberContact[],
): string[] {
  const emails = new Set(
    registrants
      .map((r) => r.email?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e)),
  );
  const phones = new Set(
    registrants.map((r) => tail(r.phone)).filter((p) => p.length === 10),
  );
  const ids = new Set<string>();
  for (const member of members) {
    if (!member.auth_user_id) continue;
    const email = member.email?.trim().toLowerCase();
    if ((email && emails.has(email)) || phones.has(tail(member.phone)))
      ids.add(member.auth_user_id);
  }
  return Array.from(ids);
}
