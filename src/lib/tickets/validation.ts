import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  RESOLVED_STATUSES,
  type TicketStatus,
} from "@/lib/tickets/constants";

export interface TicketInput {
  type: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  area: string;
  assignee: string;
  release: string;
  references: string;
}

export type TicketErrors = Partial<Record<keyof TicketInput, string>>;

const has = (list: readonly { value: string }[], value: string) =>
  list.some((i) => i.value === value);

export function validateTicket(input: TicketInput): TicketErrors {
  const errors: TicketErrors = {};
  const title = input.title.trim();
  if (title.length < 3)
    errors.title = "Give the ticket a title of at least 3 characters.";
  else if (title.length > 160)
    errors.title = "Keep the title under 160 characters.";
  if (input.description.length > 8000)
    errors.description = "Keep the description under 8000 characters.";
  if (!has(TICKET_TYPES, input.type)) errors.type = "Choose a type.";
  if (!has(TICKET_STATUSES, input.status)) errors.status = "Choose a status.";
  if (!has(TICKET_PRIORITIES, input.priority))
    errors.priority = "Choose a priority.";
  if (!/^[a-z0-9-]{1,40}$/.test(input.area.trim()))
    errors.area = "Use lowercase letters, numbers and dashes for the area.";
  if (input.assignee.length > 120)
    errors.assignee = "Keep the name under 120 characters.";
  if (input.release.length > 40)
    errors.release = "Keep the release under 40 characters.";
  if (input.references.length > 1000)
    errors.references = "Keep the references under 1000 characters.";
  return errors;
}

/** When a ticket was finished: now if it just moved into a finished status, kept if it already was, cleared if reopened. */
export function resolvedAtFor(
  previous: TicketStatus | null,
  next: TicketStatus,
  previousResolvedAt: string | null,
  now: Date,
): string | null {
  const wasResolved = previous !== null && RESOLVED_STATUSES.includes(previous);
  const isResolved = RESOLVED_STATUSES.includes(next);
  if (!isResolved) return null;
  return wasResolved && previousResolvedAt
    ? previousResolvedAt
    : now.toISOString();
}
