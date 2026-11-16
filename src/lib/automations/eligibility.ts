import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import type { AutomationTrigger, Member } from "@/types/database";
import { todayInTimezone, resolveTargetMonthDay, matchesMonthDay } from "@/lib/automations/date-logic";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";

export { todayInTimezone, dateKeyInOrgTimezone, resolveTargetMonthDay } from "@/lib/automations/date-logic";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface EligibleOccurrence {
  member: Member;
  occasionLabel: string;
  occurrenceYear: number;
}

async function resolveCustomFieldKey(admin: AdminClient, dateFieldId: string): Promise<string | null> {
  const { data } = await admin.from("member_field_definitions").select("key, field_type").eq("id", dateFieldId).maybeSingle();
  if (!data || data.field_type !== "date") return null;
  return data.key;
}

export async function findEligibleMembersForTrigger(
  admin: AdminClient,
  trigger: AutomationTrigger,
  now: Date = new Date(),
): Promise<EligibleOccurrence[]> {
  const { data: org } = await admin.from("organizations").select("timezone").eq("id", trigger.organization_id).maybeSingle();
  const today = todayInTimezone(now, org?.timezone || DEFAULT_TIMEZONE);
  const { month, day, occurrenceYear, matchFeb29Day } = resolveTargetMonthDay(today, trigger.days_offset);

  if (trigger.date_field_source === "built_in") {
    const column = trigger.built_in_field;
    if (!column) return [];

    let query = admin
      .from("members")
      .select("*")
      .eq("organization_id", trigger.organization_id)
      .not(column, "is", null);
    if (column === "wedding_date") query = query.eq("marital_status", "married");

    const { data } = await query;
    const eligible = (data ?? []).filter((member) => matchesMonthDay(member[column], month, day, matchFeb29Day));
    return eligible.map((member) => ({ member, occasionLabel: trigger.occasion_label, occurrenceYear }));
  }

  // Custom field: resolve id -> key against the live definition (so a
  // relabel never breaks the trigger), then compare in TS rather than
  // writing dynamic SQL against an interpolated jsonb key.
  if (!trigger.date_field_id) return [];
  const key = await resolveCustomFieldKey(admin, trigger.date_field_id);
  if (!key) return [];

  const { data } = await admin.from("members").select("*").eq("organization_id", trigger.organization_id);
  const eligible = (data ?? []).filter((member) => {
    const value = member.custom_fields?.[key];
    return typeof value === "string" && matchesMonthDay(value, month, day, matchFeb29Day);
  });
  return eligible.map((member) => ({ member, occasionLabel: trigger.occasion_label, occurrenceYear }));
}

export interface WeekOccurrence {
  /** 0 is today, up to 6. */
  offset: number;
  member: Member;
  occasionLabel: string;
}

/**
 * Everyone this trigger's date field puts in the seven days that start today (so, on a Sunday, the whole week to Saturday), whatever the
 * trigger's own "days before" setting is: the weekly summary lists the special days themselves, not when each wish is sent.
 */
export async function findWeekOccurrencesForTrigger(
  admin: AdminClient,
  trigger: AutomationTrigger,
  now: Date = new Date(),
): Promise<WeekOccurrence[]> {
  const { data: org } = await admin.from("organizations").select("timezone").eq("id", trigger.organization_id).maybeSingle();
  const today = todayInTimezone(now, org?.timezone || DEFAULT_TIMEZONE);

  let members: Member[] = [];
  let dateOf: (member: Member) => string | null;

  if (trigger.date_field_source === "built_in") {
    const column = trigger.built_in_field;
    if (!column) return [];
    let query = admin.from("members").select("*").eq("organization_id", trigger.organization_id).not(column, "is", null);
    if (column === "wedding_date") query = query.eq("marital_status", "married");
    members = (await query).data ?? [];
    dateOf = (member) => member[column] ?? null;
  } else {
    if (!trigger.date_field_id) return [];
    const key = await resolveCustomFieldKey(admin, trigger.date_field_id);
    if (!key) return [];
    members = (await admin.from("members").select("*").eq("organization_id", trigger.organization_id)).data ?? [];
    dateOf = (member) => {
      const value = member.custom_fields?.[key];
      return typeof value === "string" ? value : null;
    };
  }

  const found: WeekOccurrence[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const { month, day, matchFeb29Day } = resolveTargetMonthDay(today, offset);
    for (const member of members) {
      if (matchesMonthDay(dateOf(member), month, day, matchFeb29Day)) found.push({ offset, member, occasionLabel: trigger.occasion_label });
    }
  }
  return found;
}
