"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiDataAccessRules } from "@/lib/ai-rules/dal";
import type { Database } from "@/types/database";

const AI_RULES_PATH = "/dashboard/ai-rules";

type RuleColumn = keyof Database["public"]["Tables"]["ai_data_access_rules"]["Update"];

const COLUMN_BY_KEY: Record<keyof AiDataAccessRules, RuleColumn> = {
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

export interface UpdateAiRulesResult {
  error?: string;
}

// One checkbox at a time (see AiRulesManager) rather than a single "Save"
// for the whole form — same immediate-toggle pattern already used for
// Instagram AI mode and the platform feature flags, so there's nothing to
// forget to save.
export async function updateAiDataAccessRuleAction(key: keyof AiDataAccessRules, value: boolean): Promise<UpdateAiRulesResult> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const access = await checkTabAccess(organizationId, "airules", "write");
  if (!access.ok) return { error: access.message };

  // COLUMN_BY_KEY guarantees this computed key is always a real column of
  // this table — asserted rather than inferred, since a computed property
  // name otherwise makes TypeScript treat the whole object as having an
  // index signature, which Supabase's generated (signature-free) Update
  // type always rejects regardless of the actual keys used.
  const update = { organization_id: organizationId, [COLUMN_BY_KEY[key]]: value, updated_by: user.id } as Database["public"]["Tables"]["ai_data_access_rules"]["Insert"];

  const admin = createAdminClient();
  const { error } = await admin.from("ai_data_access_rules").upsert(update, { onConflict: "organization_id" });

  if (error) return { error: "Couldn't save that setting. Please try again." };

  revalidatePath(AI_RULES_PATH);
  return {};
}
