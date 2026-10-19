// The change log's vocabulary: what kinds of tickets there are, where they stand, how urgent they are.
export const TICKET_TYPES = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "improvement", label: "Improvement" },
  { value: "change_request", label: "Change request" },
  { value: "security", label: "Security" },
  { value: "task", label: "Task" },
] as const;

export const TICKET_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "in_review", label: "In review" },
  { value: "done", label: "Done" },
  { value: "closed", label: "Closed" },
  { value: "wont_do", label: "Won't do" },
] as const;

export const TICKET_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export const TICKET_AREAS = [
  "general",
  "bible-school",
  "mobile",
  "web",
  "members",
  "events",
  "giving",
  "payments",
  "prayer",
  "notifications",
  "messaging",
  "landing",
  "security",
  "platform",
] as const;

export type TicketType = (typeof TICKET_TYPES)[number]["value"];
export type TicketStatus = (typeof TICKET_STATUSES)[number]["value"];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]["value"];

/** Statuses that mean the work is finished. */
export const RESOLVED_STATUSES: TicketStatus[] = ["done", "closed", "wont_do"];

export const label = (
  list: readonly { value: string; label: string }[],
  value: string,
) => list.find((i) => i.value === value)?.label ?? value;

/** The key shown to people: KF-12. */
export const ticketKey = (number: number) => `KF-${number}`;
