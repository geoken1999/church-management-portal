import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOccurrencesInRange } from "@/lib/events/recurrence";
import { sendRegistrationReminderEmail } from "@/lib/events/registration-reminder";
import { eventVenueLabel, eventJoinLink } from "@/lib/events/location";
import { partsInTimezone, DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";

const LOOKAHEAD_MS = 25 * 60 * 60 * 1000;
const OFFSET_MS: Record<string, number> = { "24h": 24 * 60 * 60 * 1000, "1h": 60 * 60 * 1000 };

function dateKeyAndHour(date: Date, timeZone: string): { dateKey: string; hour: number } {
  const { year, month, day, hour } = partsInTimezone(date, timeZone);
  return { dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, hour };
}

// Vercel Cron hits this once a day at 2:45 UTC = 8:15 AM IST (see
// vercel.json) to send registration reminder emails — no user session
// exists on a cron-triggered request, so this checks CRON_SECRET (the same
// pattern as src/app/api/instagram/cron/refresh-tokens) rather than
// requirePlatformAdmin(), which needs a signed-in user.
//
// Once a day, not more often: Vercel's Hobby plan rejects any cron
// schedule finer than daily at deploy time. This is why "1 hour before" is
// a functionally weak option in the UI — it can only ever fire for an
// event whose "1 hour before" moment happens to land within a few minutes
// of THIS one fixed daily run, so in practice it almost never sends. "24
// hours before" and "morning of" both still work well on a once-daily
// schedule (a once-a-day check is naturally suited to a once-a-day
// reminder). Upgrading to Vercel Pro (which allows sub-daily crons) would
// let this run every 15 minutes again and make "1 hour before" reliable —
// worth raising with whoever owns hosting if that option matters.
//
// Occurrence discovery reuses src/lib/events/recurrence.ts — the same
// function the dashboard's own calendar view uses — rather than
// reimplementing recurrence math here. That function anchors monthly/
// yearly recurrence on the original start_at's local hour/day, which on
// this server means whatever timezone the Node process runs in (UTC on
// Vercel by default), not necessarily the organizer's own. For daily/
// weekly recurrence — the common case — that has no effect (fixed-day
// increments land on the same calendar day everywhere); a monthly/yearly
// event could in principle see its reminder window shift by a few hours
// near its org's midnight. Accepted as a pre-existing limitation of that
// shared function rather than something to fix here. The "morning of"
// due-check below, however, now uses each event's own org timezone
// (previously hardcoded to Asia/Kolkata for every org).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: events } = await admin
    .from("events")
    .select(
      "id, title, start_at, end_at, is_recurring, recurrence_frequency, recurrence_end_date, reminder_offset, meeting_mode, meeting_link, venue, map_link, organization_id, registration_pass_color, branches(name), organizations(name, timezone)",
    )
    .not("reminder_offset", "is", null)
    .eq("registration_enabled", true)
    .eq("status", "active");

  let remindersSent = 0;
  let eventsChecked = 0;

  for (const event of events ?? []) {
    eventsChecked += 1;
    const organizationTimezone = (event.organizations as { timezone: string } | null)?.timezone || DEFAULT_TIMEZONE;

    const occurrences = getOccurrencesInRange([event], now, new Date(now.getTime() + LOOKAHEAD_MS));
    if (occurrences.length === 0) continue;
    const occurrenceDate = occurrences[0].date;
    if (occurrenceDate <= now) continue;

    let due = false;
    if (event.reminder_offset === "morning_of") {
      const { dateKey, hour } = dateKeyAndHour(now, organizationTimezone);
      const occurrenceDateKey = dateKeyAndHour(occurrenceDate, organizationTimezone).dateKey;
      due = dateKey === occurrenceDateKey && hour >= 8;
    } else {
      const offsetMs = OFFSET_MS[event.reminder_offset ?? ""] ?? 0;
      due = now.getTime() >= occurrenceDate.getTime() - offsetMs;
    }
    if (!due) continue;

    const occurrenceKey = occurrenceDate.toISOString().slice(0, 10);

    const { data: registrations } = await admin
      .from("event_registrations")
      .select("id, email, answers, confirmation_code, status, last_reminder_occurrence_date")
      .eq("event_id", event.id)
      .neq("status", "cancelled");

    const pending = (registrations ?? []).filter((r) => r.last_reminder_occurrence_date !== occurrenceKey);
    if (pending.length === 0) continue;

    const venueLabel = eventVenueLabel({
      meeting_mode: event.meeting_mode,
      venue: event.venue,
      branchName: (event.branches as { name: string } | null)?.name,
    });
    const joinLink = eventJoinLink(event);
    const organizationName = (event.organizations as { name: string } | null)?.name ?? "Your church";

    for (const registration of pending) {
      const answersRecord = registration.answers as Record<string, unknown>;
      const recipientName = typeof answersRecord.name === "string" ? answersRecord.name : null;

      await sendRegistrationReminderEmail({
        organizationId: event.organization_id,
        organizationName,
        organizationTimezone,
        to: registration.email,
        recipientName,
        eventTitle: event.title,
        startAt: occurrenceDate.toISOString(),
        venueLabel,
        mapLink: event.map_link,
        joinLink,
        confirmationCode: registration.confirmation_code,
        passColor: event.registration_pass_color,
      });

      await admin
        .from("event_registrations")
        .update({ last_reminder_occurrence_date: occurrenceKey, last_reminder_sent_at: new Date().toISOString() })
        .eq("id", registration.id);

      remindersSent += 1;
    }
  }

  return NextResponse.json({ eventsChecked, remindersSent });
}
