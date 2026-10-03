import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AiDataAccessRules {
  // Staff-only — Ask Aura only, no Instagram/WhatsApp equivalent exists.
  allowAttendance: boolean;
  allowMembers: boolean;
  allowFinance: boolean;
  // Ask Aura's own access to each — independent of whichever public
  // channels below are also allowed to use the same data. Full access by
  // default, same as everything else.
  allowFundraisers: boolean;
  allowEvents: boolean;
  allowMinistries: boolean;
  allowBranches: boolean;
  allowForms: boolean;
  // Instagram and WhatsApp controlled independently, so an org can e.g.
  // share fundraisers over WhatsApp but not Instagram.
  allowFundraisersInstagram: boolean;
  allowFundraisersWhatsapp: boolean;
  allowEventsInstagram: boolean;
  allowEventsWhatsapp: boolean;
  allowMinistriesInstagram: boolean;
  allowMinistriesWhatsapp: boolean;
  allowBranchesInstagram: boolean;
  allowBranchesWhatsapp: boolean;
  allowFormsInstagram: boolean;
  allowFormsWhatsapp: boolean;
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
  allowFundraisersInstagram: true,
  allowFundraisersWhatsapp: true,
  allowEventsInstagram: true,
  allowEventsWhatsapp: true,
  allowMinistriesInstagram: true,
  allowMinistriesWhatsapp: true,
  allowBranchesInstagram: true,
  allowBranchesWhatsapp: true,
  allowFormsInstagram: true,
  allowFormsWhatsapp: true,
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
  const { data } = await admin.from("ai_data_access_rules").select("*").eq("organization_id", organizationId).maybeSingle();

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
    allowFundraisersInstagram: data.allow_fundraisers_instagram,
    allowFundraisersWhatsapp: data.allow_fundraisers_whatsapp,
    allowEventsInstagram: data.allow_events_instagram,
    allowEventsWhatsapp: data.allow_events_whatsapp,
    allowMinistriesInstagram: data.allow_ministries_instagram,
    allowMinistriesWhatsapp: data.allow_ministries_whatsapp,
    allowBranchesInstagram: data.allow_branches_instagram,
    allowBranchesWhatsapp: data.allow_branches_whatsapp,
    allowFormsInstagram: data.allow_forms_instagram,
    allowFormsWhatsapp: data.allow_forms_whatsapp,
  };
});

export type AiReplyChannel = "instagram" | "whatsapp";

// The slice of AiDataAccessRules that actually matters to
// getOrganizationContextForAi — collapses the per-channel columns down to
// a single flat view for whichever channel is asking, so that function
// doesn't need to know about Ask Aura's separate fields at all.
export interface ChannelDataAccessRules {
  allowFundraisers: boolean;
  allowEvents: boolean;
  allowMinistries: boolean;
  allowBranches: boolean;
  allowForms: boolean;
}

export function rulesForChannel(rules: AiDataAccessRules, channel: AiReplyChannel): ChannelDataAccessRules {
  const suffix = channel === "instagram" ? "Instagram" : "Whatsapp";
  return {
    allowFundraisers: rules[`allowFundraisers${suffix}` as const],
    allowEvents: rules[`allowEvents${suffix}` as const],
    allowMinistries: rules[`allowMinistries${suffix}` as const],
    allowBranches: rules[`allowBranches${suffix}` as const],
    allowForms: rules[`allowForms${suffix}` as const],
  };
}
