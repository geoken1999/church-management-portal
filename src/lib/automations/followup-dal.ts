import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Automation, AutomationRun, AutomationRunItem } from "@/types/database";

// Reads for the Member follow-up pages. Every query is scoped to the
// organization passed in, and the RLS policies on the tables are the second
// line of defence.

export const getFollowupAutomations = cache(async (organizationId: string): Promise<Automation[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("type", "member_followup")
    .order("created_at", { ascending: false });
  return (data ?? []) as Automation[];
});

export const getFollowupAutomation = cache(async (organizationId: string, automationId: string): Promise<Automation | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", automationId)
    .eq("type", "member_followup")
    .maybeSingle();
  return (data as Automation | null) ?? null;
});

export const getFollowupRuns = cache(async (organizationId: string, automationId: string, limit = 20): Promise<AutomationRun[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automation_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("automation_id", automationId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AutomationRun[];
});

export interface FollowupRunItemRow extends AutomationRunItem {
  memberName: string;
}

export const getFollowupRunItems = cache(async (organizationId: string, runId: string): Promise<FollowupRunItemRow[]> => {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("automation_run_items")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("run_id", runId)
    .order("created_at", { ascending: true })
    .limit(500);
  const rows = (items ?? []) as AutomationRunItem[];
  if (rows.length === 0) return [];

  const memberIds = [...new Set(rows.map((r) => r.member_id).filter((id): id is string => id !== null))];
  const { data: members } = await supabase
    .from("members")
    .select("id, first_name, last_name")
    .eq("organization_id", organizationId)
    .in("id", memberIds);
  const names = new Map((members ?? []).map((m) => [m.id, `${m.first_name} ${m.last_name}`.trim()]));

  return rows.map((r) => ({ ...r, memberName: (r.member_id && names.get(r.member_id)) || "Member" }));
});

export const getBranchOptions = cache(async (organizationId: string): Promise<{ id: string; name: string }[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("branches").select("id, name").eq("organization_id", organizationId).order("name");
  return data ?? [];
});
