import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits } from "@/lib/plans/dal";
import { kaudioMaxDurationMinutes } from "@/lib/plans/config";
import {
  DEFAULT_TIMEZONE,
  partsInTimezone,
  zonedTimeToUtc,
} from "@/lib/organizations/timezone";
import {
  minutesLeftFor,
  minutesUsed,
  summarizeMinutes,
  type CallRecord,
  type MinutesSummary,
} from "@/lib/kmeet/minutes";
import type { KmeetMode } from "@/types/database";

/** "2025-03" for the church's current month. */
export function monthKey(now: Date, timeZone: string): string {
  const { year, month } = partsInTimezone(now, timeZone);
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthBounds(now: Date, timeZone: string): { from: Date; to: Date } {
  const { year, month } = partsInTimezone(now, timeZone);
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: zonedTimeToUtc(`${year}-${pad(month)}-01T00:00`, timeZone),
    to: zonedTimeToUtc(`${next.y}-${pad(next.m)}-01T00:00`, timeZone),
  };
}

export interface KmeetMinutes extends MinutesSummary {
  month: string;
}

/** This month's K-Connect minutes for a church: the plan's pools, what was used and what bought minutes remain. */
export async function getKmeetMinutes(
  organizationId: string,
  now: Date = new Date(),
): Promise<KmeetMinutes> {
  const admin = createAdminClient();
  const [{ data: org }, plan] = await Promise.all([
    admin
      .from("organizations")
      .select("timezone, addon_kmeet_minutes, addon_kmeet_month")
      .eq("id", organizationId)
      .maybeSingle(),
    getPlanLimits(organizationId),
  ]);
  const timeZone = org?.timezone || DEFAULT_TIMEZONE;
  const { from, to } = monthBounds(now, timeZone);
  const month = monthKey(now, timeZone);

  const { data: calls } = await admin
    .from("kmeet_meetings")
    .select("mode, started_at, ended_at")
    .eq("organization_id", organizationId)
    .not("started_at", "is", null)
    .lt("started_at", to.toISOString())
    .or(`ended_at.is.null,ended_at.gte.${from.toISOString()}`);
  const records: CallRecord[] = (calls ?? []).map((c) => ({
    mode: c.mode,
    startedAt: c.started_at,
    endedAt: c.ended_at,
  }));

  const extraBought =
    org?.addon_kmeet_month === month ? (org?.addon_kmeet_minutes ?? 0) : 0;
  const summary = summarizeMinutes(
    {
      video: plan.kmeetMaxDurationMinutes,
      audio: kaudioMaxDurationMinutes(plan),
    },
    minutesUsed(records, from, to, now),
    extraBought,
  );
  return { ...summary, month };
}

/**
 * How long a call of this kind may run if it starts now: a number of minutes, null for unlimited, or 0 when
 * the church has none left this month.
 */
export async function minutesAvailableFor(
  organizationId: string,
  mode: KmeetMode,
): Promise<number | null> {
  return minutesLeftFor(await getKmeetMinutes(organizationId), mode);
}
