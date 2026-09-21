import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getProfile } from "@/lib/auth/dal";
import { normalizeTabPermissions, allFullTabAccess, type TabKey } from "@/lib/permissions/tabs";
import type { Organization, OrganizationRole, TabAccess } from "@/types/database";

export interface OrganizationMembership {
  organization: Organization;
  role: OrganizationRole;
  // Already resolved for the member's role — owner/admin always get full
  // access here regardless of what's stored, so callers never need to
  // special-case the role themselves.
  tabAccess: Record<TabKey, TabAccess>;
}

// All organizations the current user belongs to (for the org switcher).
export const getUserOrganizations = cache(async (): Promise<OrganizationMembership[]> => {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role, tab_permissions, organizations(*)")
    .eq("auth_user_id", user.id);

  if (!data) return [];

  return data
    .filter((row): row is typeof row & { organizations: Organization } => Boolean(row.organizations))
    .map((row) => ({
      organization: row.organizations,
      role: row.role,
      tabAccess:
        row.role === "owner" || row.role === "admin"
          ? allFullTabAccess()
          : normalizeTabPermissions(row.tab_permissions),
    }));
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

