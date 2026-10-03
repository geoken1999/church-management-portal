"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiDataAccessRules } from "@/lib/ai-rules/dal";

const AI_RULES_PATH = "/dashboard/ai-rules";

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

  // Built as an explicit per-key object (not a computed property name)
  // so Supabase's generated Insert type — which rejects unrecognized
  // columns — can actually check it; a `[columnByKey[key]]: value`
  // computed key loses that column-name typing entirely.
  const columnUpdate =
    key === "allowAttendance"
      ? { allow_attendance: value }
      : key === "allowMembers"
        ? { allow_members: value }
        : key === "allowFinance"
          ? { allow_finance: value }
          : key === "allowFundraisers"
            ? { allow_fundraisers: value }
            : key === "allowEvents"
              ? { allow_events: value }
              : key === "allowMinistries"
                ? { allow_ministries: value }
                : key === "allowBranches"
                  ? { allow_branches: value }
                  : { allow_forms: value };

  const admin = createAdminClient();
  const { error } = await admin
    .from("ai_data_access_rules")
    .upsert({ organization_id: organizationId, ...columnUpdate, updated_by: user.id }, { onConflict: "organization_id" });

  if (error) return { error: "Couldn't save that setting. Please try again." };

  revalidatePath(AI_RULES_PATH);
  return {};
}
