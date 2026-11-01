import "server-only";

import { cache } from "react";
import { placeInWeeks } from "@/lib/dashboard/celebration-weeks";
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

export interface UpcomingCelebrations {
  thisWeek: UpcomingCelebration[];
  nextWeek: UpcomingCelebration[];
}

// Calendar weeks, Monday to Sunday: "this week" is the current week (days already past still show) and "next week"
// the one after (see celebration-weeks.ts).
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

    const add = (entry: UpcomingCelebration, week: "thisWeek" | "nextWeek") => (week === "thisWeek" ? thisWeek : nextWeek).push(entry);

    for (const row of rows) {
      const name = `${row.first_name} ${row.last_name}`;

      if (row.date_of_birth) {
        const placed = placeInWeeks(row.date_of_birth, today);
        if (placed) {
          add(
            {
              memberId: row.id,
              name,
              type: "birthday",
              occursOn: formatIsoDate(placed.occurrence),
              years: placed.occurrence.getFullYear() - parseIsoDateParts(row.date_of_birth).year,
            },
            placed.week,
          );
        }
      }

      if (row.marital_status === "married" && row.wedding_date) {
        const placed = placeInWeeks(row.wedding_date, today);
        if (placed) {
          add(
            {
              memberId: row.id,
              name,
              type: "anniversary",
              occursOn: formatIsoDate(placed.occurrence),
              years: placed.occurrence.getFullYear() - parseIsoDateParts(row.wedding_date).year,
            },
            placed.week,
          );
        }
      }
    }

    const byDate = (a: UpcomingCelebration, b: UpcomingCelebration) => a.occursOn.localeCompare(b.occursOn);
    thisWeek.sort(byDate);
    nextWeek.sort(byDate);

    return { thisWeek, nextWeek };
  },
);
