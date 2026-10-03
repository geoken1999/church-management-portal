import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AiDataAccessRules {
  allowAttendance: boolean;
  allowMembers: boolean;
  allowFinance: boolean;
  allowFundraisers: boolean;
  allowEvents: boolean;
  allowMinistries: boolean;
  allowBranches: boolean;
  allowForms: boolean;
}

export const DEFAULT_AI_DATA_ACCESS_RULES: AiDataAccessRules = {
  allowAttendance: true,
  allowMembers: true,
  allowFinance: true,
  allowFundraisers: true,
  allowEvents: true,
  allowMinistries: true,
  allowBranches: true,
  allowForms: true,
};

// Read via the admin client everywhere, including from the dashboard
// settings page — not just the Instagram/WhatsApp webhooks (which have no
// session at all). Every org member sees the same rules regardless of
// role, so there's no per-user RLS nuance a session-scoped read would add;
// keeping one function usable from both webhook and session contexts
// avoids a duplicate *ForWebhook variant for something this simple.
// Missing row = everything enabled, so a brand-new org doesn't have to
// visit this settings page before Ask Aura or the auto-reply bots work.
export const getAiDataAccessRules = cache(async (organizationId: string): Promise<AiDataAccessRules> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("ai_data_access_rules")
    .select("allow_attendance, allow_members, allow_finance, allow_fundraisers, allow_events, allow_ministries, allow_branches, allow_forms")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return DEFAULT_AI_DATA_ACCESS_RULES;

  return {
    allowAttendance: data.allow_attendance,
    allowMembers: data.allow_members,
    allowFinance: data.allow_finance,
    allowFundraisers: data.allow_fundraisers,
    allowEvents: data.allow_events,
    allowMinistries: data.allow_ministries,
    allowBranches: data.allow_branches,
    allowForms: data.allow_forms,
  };
});
