"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseYouthAgeRule } from "@/lib/youth/age-rule";

export interface YouthAgeRuleResult {
  error?: string;
  success?: boolean;
  added?: number;
  removed?: number;
}

// Sets (or clears) the church's youth age range, then brings the Youth
// roster in line with it right away: members in the range are added, and
// ones the rule added earlier who no longer fit are taken off. People added
// to Youth by hand are never touched.
export async function saveYouthAgeRuleAction(from: string, to: string): Promise<YouthAgeRuleResult> {
  await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only an owner or admin can change the youth age rule." };

  const parsed = parseYouthAgeRule(from, to);
  if (parsed.error) return { error: parsed.error };

  const admin = createAdminClient();
  const organizationId = membership.organization.id;
  const { error } = await admin
    .from("organizations")
    .update({ youth_age_from: parsed.rule?.from ?? null, youth_age_to: parsed.rule?.to ?? null })
    .eq("id", organizationId);
  if (error) return { error: "Couldn't save the youth age rule. Please try again." };

  const { data, error: syncError } = await admin.rpc("sync_youth_for_org", { target_org_id: organizationId }).maybeSingle();
  if (syncError) return { error: "Saved the rule, but couldn't update the Youth list. It will catch up overnight." };

  revalidatePath("/dashboard/youth");
  revalidatePath("/dashboard/members");
  return { success: true, added: data?.added ?? 0, removed: data?.removed ?? 0 };
}
