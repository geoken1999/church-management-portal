import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface DashboardOverviewStats {
  totalMembers: number;
  newMembersThisMonth: number;
  upcomingEvents: number;
  eventsThisWeek: number;
  teamMembers: number;
  teamAdmins: number;
  branches: number;
}

// Head-count queries (count: "exact", head: true) — Postgres only computes
// the count, no rows are transferred, so this stays cheap even as tables
// grow. Every count is scoped by the same RLS policies that already gate
// the full member/event/team/branch list pages, so this never surfaces a
// number the caller couldn't already derive by paging through those lists.
export const getDashboardOverviewStats = cache(
  async (organizationId: string): Promise<DashboardOverviewStats> => {
    const supabase = await createClient();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const [
      totalMembers,
      newMembersThisMonth,
      upcomingEvents,
      eventsThisWeek,
      teamMembers,
      teamAdmins,
      branches,
    ] = await Promise.all([
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .gte("created_at", startOfMonth),
      supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("start_at", nowIso),
      supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("start_at", nowIso)
        .lte("start_at", weekFromNow),
      supabase
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      supabase
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("role", ["owner", "admin"]),
      supabase
        .from("branches")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId),
    ]);

    return {
      totalMembers: totalMembers.count ?? 0,
      newMembersThisMonth: newMembersThisMonth.count ?? 0,
      upcomingEvents: upcomingEvents.count ?? 0,
      eventsThisWeek: eventsThisWeek.count ?? 0,
      teamMembers: teamMembers.count ?? 0,
      teamAdmins: teamAdmins.count ?? 0,
      branches: branches.count ?? 0,
    };
  },
);

export type CelebrationType = "birthday" | "anniversary";

export interface UpcomingCelebration {
  memberId: string;
  name: string;
  type: CelebrationType;
  occursOn: string; // yyyy-mm-dd, this cycle's occurrence (not the original year)
  years: number; // age turning, or years married
}

interface CelebrationRow {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  marital_status: string | null;
  wedding_date: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatIsoDate(d: Date): string {
  // Deliberately not toISOString() — that converts through UTC, which
  // shifts the calendar date by a day for timezones ahead of UTC when the
  // local time is midnight. This formats from the Date's own local
  // year/month/day instead.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// date_of_birth/wedding_date come back from Postgres as plain "YYYY-MM-DD"
// strings — parsed by splitting rather than `new Date(iso)` so a reader in
// a timezone ahead of UTC never sees the year/month/day shift a `Date`
// parse of a bare date string can cause.
function parseIsoDateParts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: month - 1, day };
}

// Birthdays/anniversaries recur annually — this resolves a stored date to
// its next occurrence from `today` (this year if it hasn't passed yet,
// otherwise next year), which is what "falls in this/next week" needs
// regardless of what year the original event happened.
function nextOccurrence(iso: string, today: Date): Date {
  const { month, day } = parseIsoDateParts(iso);
  const year = today.getFullYear();
  let occurrence = new Date(year, month, day);
  if (occurrence < today) occurrence = new Date(year + 1, month, day);
  return occurrence;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export interface UpcomingCelebrations {
  thisWeek: UpcomingCelebration[];
  nextWeek: UpcomingCelebration[];
}

// Rolling 7-day windows (today..+6, +7..+13) rather than calendar
// Sun-Sat weeks — same convention as eventsThisWeek above, and it means
// "this week" always means "the next 7 days" regardless of what day it is.
export const getUpcomingCelebrations = cache(
  async (organizationId: string): Promise<UpcomingCelebrations> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("members")
      .select("id, first_name, last_name, date_of_birth, marital_status, wedding_date")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .or("date_of_birth.not.is.null,wedding_date.not.is.null");

    const rows = (data ?? []) as CelebrationRow[];
    const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    const thisWeek: UpcomingCelebration[] = [];
    const nextWeek: UpcomingCelebration[] = [];

    const add = (entry: UpcomingCelebration, daysAway: number) => {
      if (daysAway <= 6) thisWeek.push(entry);
      else if (daysAway <= 13) nextWeek.push(entry);
    };

    for (const row of rows) {
      const name = `${row.first_name} ${row.last_name}`;

      if (row.date_of_birth) {
        const occurrence = nextOccurrence(row.date_of_birth, today);
        add(
          {
            memberId: row.id,
            name,
            type: "birthday",
            occursOn: formatIsoDate(occurrence),
            years: occurrence.getFullYear() - parseIsoDateParts(row.date_of_birth).year,
          },
          daysBetween(today, occurrence),
        );
      }

      if (row.marital_status === "married" && row.wedding_date) {
        const occurrence = nextOccurrence(row.wedding_date, today);
        add(
          {
            memberId: row.id,
            name,
            type: "anniversary",
            occursOn: formatIsoDate(occurrence),
            years: occurrence.getFullYear() - parseIsoDateParts(row.wedding_date).year,
          },
          daysBetween(today, occurrence),
        );
      }
    }

    const byDate = (a: UpcomingCelebration, b: UpcomingCelebration) => a.occursOn.localeCompare(b.occursOn);
    thisWeek.sort(byDate);
    nextWeek.sort(byDate);

    return { thisWeek, nextWeek };
  },
);
