import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/plans/config";
import type { CustomPlanOverrides } from "@/lib/plans/config";
import { limitsFor } from "@/lib/onboarding/limits";
import {
  cleanCredits,
  tabStatesFor,
  type Credits,
  type PlanType,
} from "@/lib/onboarding/config";

export interface ModulePrice {
  monthly_price: number;
  is_default: boolean;
}

export async function getModulePricing(): Promise<Record<string, ModulePrice>> {
  const { data } = await createAdminClient()
    .from("module_pricing")
    .select("module_key, monthly_price, is_default");
  const result: Record<string, ModulePrice> = {};
  for (const row of data ?? [])
    result[row.module_key] = {
      monthly_price: Number(row.monthly_price),
      is_default: row.is_default,
    };
  return result;
}

export interface OnboardingRow {
  organization_id: string;
  status: "in_progress" | "awaiting_payment" | "active";
  modules: string[];
  plan_type: PlanType;
  credits: Credits;
  monthly_base: number;
  notes: string;
  sent_at: string | null;
  activated_at: string | null;
}

export async function getOnboarding(
  organizationId: string,
): Promise<OnboardingRow | null> {
  const { data } = await createAdminClient()
    .from("tenant_onboarding")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    monthly_base: Number(data.monthly_base),
    status: data.status as OnboardingRow["status"],
    plan_type: data.plan_type as PlanType,
    credits: cleanCredits(data.credits),
  };
}

export interface OnboardingDocument {
  id: string;
  doc_type: string;
  file_name: string;
  file_path: string;
  status: "uploaded" | "verified" | "rejected";
  note: string;
  created_at: string;
}

export async function getOnboardingDocuments(
  organizationId: string,
): Promise<OnboardingDocument[]> {
  const { data } = await createAdminClient()
    .from("tenant_onboarding_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at");
  return (data ?? []) as OnboardingDocument[];
}

// Switches a tenant's chosen modules and limits on: the Pro plan's rules for everything not set
// here, with every module not chosen turned off for this tenant. What the platform admin set is
// exactly what the tenant gets: every limit that was not set (monthly emails, SMS, WhatsApp and AI
// replies, storage, members, branches, forms, chat groups, logins, call length, social accounts) falls
// back to the Starter plan's number, so a tenant never gets more than was priced.
export async function applyOnboardingModules(
  organizationId: string,
  modules: string[],
  credits: Credits,
): Promise<void> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("custom_plan_limits")
    .eq("id", organizationId)
    .maybeSingle();
  const existing = (org?.custom_plan_limits ??
    null) as CustomPlanOverrides | null;
  const {
    id: _id,
    name: _name,
    priceInRupees: _p,
    priceLabel: _pl,
    priceInRupeesAnnual: _pa,
    priceLabelAnnual: _pla,
    ...proRules
  } = PLANS.pro;
  void [_id, _name, _p, _pl, _pa, _pla];
  const next: CustomPlanOverrides = {
    ...proRules,
    ...(existing ?? {}),
    ...limitsFor(credits),
    tabOverrides: tabStatesFor(modules),
  };
  await admin
    .from("organizations")
    .update({ plan: "pro", custom_plan_limits: next as unknown as never })
    .eq("id", organizationId);
}
