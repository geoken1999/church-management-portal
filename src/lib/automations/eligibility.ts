import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import type { AutomationTrigger, Member } from "@/types/database";
import { todayInIST, resolveTargetMonthDay, matchesMonthDay } from "@/lib/automations/date-logic";

export { todayInIST, dateKeyIST, resolveTargetMonthDay } from "@/lib/automations/date-logic";

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
  const today = todayInIST(now);
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
