// A to-do's assignee comes from one dropdown holding two kinds of people:
// team members who log in to the dashboard ("u:<auth user id>") and leaders,
// who are church members ("m:<member id>"). Pure, so the form, the server
// action and the tests agree on the encoding.
export type AssigneeChoice = { kind: "none" } | { kind: "user"; id: string } | { kind: "leader"; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAssignee(raw: string): AssigneeChoice | null {
  const value = raw.trim();
  if (!value) return { kind: "none" };
  const match = value.match(/^([um]):(.+)$/);
  if (!match || !UUID.test(match[2])) return null;
  return match[1] === "u" ? { kind: "user", id: match[2] } : { kind: "leader", id: match[2] };
}

export function assigneeValue(assignedTo: string | null, assignedMemberId: string | null): string {
  if (assignedTo) return `u:${assignedTo}`;
  if (assignedMemberId) return `m:${assignedMemberId}`;
  return "";
}
