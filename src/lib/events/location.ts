import type { EventMeetingMode } from "@/types/database";

export const MEETING_MODE_LABELS: Record<EventMeetingMode, string> = {
  offline: "In person",
  online: "Online",
  hybrid: "In person + Online",
};

// A hybrid event has both a physical venue AND an online join link — unlike
// offline/online, which each have exactly one. Every place that shows an
// event's "where" (the registration pass email, the reminder email, the
// dashboard list, reports) asks these two questions independently rather
// than picking a single combined string, so a hybrid event's registrant
// sees both a location line and a join-online line instead of losing one.
export function eventVenueLabel(event: {
  meeting_mode: EventMeetingMode;
  venue: string | null;
  branchName?: string | null;
}): string | null {
  if (event.meeting_mode === "online") return null;
  return event.venue?.trim() || event.branchName || MEETING_MODE_LABELS.offline;
}

export function eventJoinLink(event: { meeting_mode: EventMeetingMode; meeting_link: string | null }): string | null {
  return event.meeting_mode !== "offline" ? event.meeting_link : null;
}
