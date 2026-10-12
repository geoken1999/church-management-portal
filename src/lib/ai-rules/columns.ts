import type { AiDataAccessRules } from "@/lib/ai-rules/dal";
import type { Database } from "@/types/database";

export type RuleColumn = keyof Database["public"]["Tables"]["ai_data_access_rules"]["Update"];

export const COLUMN_BY_KEY: Record<keyof AiDataAccessRules, RuleColumn> = {
  allowAttendance: "allow_attendance",
  allowMembers: "allow_members",
  allowFinance: "allow_finance",
  allowFundraisers: "allow_fundraisers",
  allowEvents: "allow_events",
  allowMinistries: "allow_ministries",
  allowBranches: "allow_branches",
  allowForms: "allow_forms",
  allowFundraisersInstagram: "allow_fundraisers_instagram",
  allowFundraisersWhatsapp: "allow_fundraisers_whatsapp",
  allowEventsInstagram: "allow_events_instagram",
  allowEventsWhatsapp: "allow_events_whatsapp",
  allowMinistriesInstagram: "allow_ministries_instagram",
  allowMinistriesWhatsapp: "allow_ministries_whatsapp",
  allowBranchesInstagram: "allow_branches_instagram",
  allowBranchesWhatsapp: "allow_branches_whatsapp",
  allowFormsInstagram: "allow_forms_instagram",
  allowFormsWhatsapp: "allow_forms_whatsapp",
};

