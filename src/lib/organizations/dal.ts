import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getProfile } from "@/lib/auth/dal";
import { normalizeTabPermissions, allFullTabAccess, noTabAccess, TAB_KEYS, type TabKey } from "@/lib/permissions/tabs";
import { isPlanId, moduleOfTab, resolveTabStates, type CustomPlanOverrides } from "@/lib/plans/config";
import { purchasableModuleKeys } from "@/lib/billing/modules";
import { getDisabledFeatures } from "@/lib/platform-admin/feature-flags";
import type { Organization, OrganizationRole, TabAccess } from "@/types/database";

export interface OrganizationMembership {
  organization: Organization;
  role: OrganizationRole;
  // Already resolved for the member's role — owner/admin always get full
  // access here regardless of what's stored, so callers never need to
  // special-case the role themselves.
  tabAccess: Record<TabKey, TabAccess>;
  // Tabs the person could use if their church's plan included them and that the church can buy as a module: shown
  // in the menu, locked, with a way to subscribe. Never includes a tab the platform has switched off.
  lockedTabs: TabKey[];
}

// All organizations the current user belongs to (for the org switcher).
export const getUserOrganizations = cache(async (): Promise<OrganizationMembership[]> => {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = await createClient();
  const [{ data }, disabledFeatures, purchasable] = await Promise.all([
    supabase.from("organization_members").select("role, tab_permissions, organizations(*)").eq("auth_user_id", user.id),
    getDisabledFeatures(user.email),
    purchasableModuleKeys().catch(() => new Set<string>()),
  ]);

  if (!data) return [];

  // A platform admin's kill switch overrides every org's own tab_permissions
  // and even the owner/admin "always full access" rule below — it's a layer
  // above both, not a third option alongside them.
  function withGlobalFlags(access: Record<TabKey, TabAccess>): Record<TabKey, TabAccess> {
    if (disabledFeatures.size === 0) return access;
    const result = { ...access };
    for (const tab of disabledFeatures) {
      result[tab] = noTabAccess();
    }
    return result;
  }

  // A tab the org's plan or a custom rule excludes is hidden for everyone
  // in that org, owners included — same layering as the kill switch above.
  function withOrgFlags(access: Record<TabKey, TabAccess>, org: Organization): Record<TabKey, TabAccess> {
    const planId = org.plan && isPlanId(org.plan) ? org.plan : "basic";
    const tabStates = resolveTabStates(planId, (org.custom_plan_limits ?? null) as CustomPlanOverrides | null, org.addon_modules);
    const result = { ...access };
    for (const tab of TAB_KEYS) {
      if (!tabStates[tab]) result[tab] = noTabAccess();
    }
    return result;
  }

  // The tabs the church's plan leaves out that this person's own permissions would allow, and that can be bought.
  function lockedFor(access: Record<TabKey, TabAccess>, org: Organization): TabKey[] {
    const planId = org.plan && isPlanId(org.plan) ? org.plan : "basic";
    const tabStates = resolveTabStates(planId, (org.custom_plan_limits ?? null) as CustomPlanOverrides | null, org.addon_modules);
    return TAB_KEYS.filter((tab) => !tabStates[tab] && access[tab].read && purchasable.has(moduleOfTab(tab)));
  }

  return data
    .filter((row): row is typeof row & { organizations: Organization } => Boolean(row.organizations))
    .map((row) => {
      const roleAccess = withGlobalFlags(row.role === "owner" || row.role === "admin" ? allFullTabAccess() : normalizeTabPermissions(row.tab_permissions));
      return {
        organization: row.organizations,
        role: row.role,
        tabAccess: withOrgFlags(roleAccess, row.organizations),
        lockedTabs: lockedFor(roleAccess, row.organizations),
      };
    });
});

// The organization the user is currently working in. Self-heals if
// active_organization_id is stale (e.g. they were removed from that org) by
// falling back to any other membership.
export const getActiveOrganization = cache(async (): Promise<OrganizationMembership | null> => {
  const profile = await getProfile();
  if (!profile) return null;

  const memberships = await getUserOrganizations();
  if (memberships.length === 0) return null;

  const active = memberships.find((m) => m.organization.id === profile.active_organization_id);
  if (active) return active;

  // Stale or unset — repoint at the first available membership.
  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ active_organization_id: memberships[0].organization.id })
    .eq("auth_user_id", profile.auth_user_id);

  return memberships[0];
});

// Use in pages that require an active organization (i.e. everything past
// onboarding). Redirects to /onboarding rather than erroring, since "no org
// yet" is an expected state for a brand-new user.
export async function requireOrganization() {
  const membership = await getActiveOrganization();
  if (!membership) {
    redirect("/onboarding");
  }
  return membership;
}

export const getPendingInvitationsForMe = cache(async () => {
  const user = await getAuthUser();
  if (!user?.email) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_invitations")
    .select("*, organizations(name, slug)")
    .eq("email", user.email)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());

  return data ?? [];
});

export const getOrganizationMembers = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("id, role, title, auth_user_id, tab_permissions, profiles!inner(first_name, last_name, email)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return data ?? [];
});

