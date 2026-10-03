import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AutomationTemplateKind } from "@/types/database";

export const getAutomations = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automations")
    .select("*, automation_triggers(id), automation_destinations(id, kind, is_active)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return data ?? [];
});

export const getAutomation = cache(async (organizationId: string, automationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("automations").select("*").eq("organization_id", organizationId).eq("id", automationId).maybeSingle();
  return data;
});

export const getAutomationTriggers = cache(async (organizationId: string, automationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automation_triggers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("automation_id", automationId)
    .order("created_at", { ascending: true });
  return data ?? [];
});

export const getAutomationDestinations = cache(async (organizationId: string, automationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("automation_destinations").select("*").eq("organization_id", organizationId).eq("automation_id", automationId);
  return data ?? [];
});

export const getAutomationTemplates = cache(async (organizationId: string, kind?: AutomationTemplateKind) => {
  const supabase = await createClient();
  let query = supabase.from("automation_templates").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
  if (kind) query = query.eq("kind", kind);
  const { data } = await query;
  return data ?? [];
});

export const getAutomationExecutions = cache(async (organizationId: string, automationId: string, limit = 50) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automation_executions")
    .select("*, members(first_name, last_name)")
    .eq("organization_id", organizationId)
    .eq("automation_id", automationId)
    .order("sent_at", { ascending: false })
    .limit(limit);
  return data ?? [];
});

// Eligible date-field options for the trigger step: the two built-in
// member columns, unioned with any org-defined custom field whose
// field_type is 'date'. Returned as a flat list the wizard can render as
// one picker, each option carrying what the trigger needs to store.
export const getEligibleDateFields = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("member_field_definitions")
    .select("id, key, label, field_type")
    .eq("organization_id", organizationId)
    .eq("field_type", "date")
    .order("sort_order", { ascending: true });

  return [
    { source: "built_in" as const, builtInField: "date_of_birth" as const, dateFieldId: null, label: "Birthday" },
    { source: "built_in" as const, builtInField: "wedding_date" as const, dateFieldId: null, label: "Wedding Anniversary" },
    ...(data ?? []).map((field) => ({ source: "custom_field" as const, builtInField: null, dateFieldId: field.id, label: field.label })),
  ];
});
