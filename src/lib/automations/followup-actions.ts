"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { getPlanLimits, checkAutomationQuota } from "@/lib/plans/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFollowupConfig, type FollowupConfigErrors } from "@/lib/automations/followup-config";
import { canReceiveFollowupTasks } from "@/lib/automations/followup-assignees";
import type { AutomationStatus, OrganizationRole, TabPermissions } from "@/types/database";

const AUTOMATIONS_PATH = "/dashboard/automation";

export interface FollowupFormInput {
  name: string;
  description: string;
  status: "draft" | "active";
  requiredConsecutive: number;
  runWeekday: number;
  branchIds: string[];
  allBranches: boolean;
  assigneeUserId: string;
  dueWorkingDays: number;
  priority: string;
}

export type FollowupFieldErrors = FollowupConfigErrors & { name?: string; branchIds?: string };

export interface FollowupFormState {
  error?: string;
  fieldErrors?: FollowupFieldErrors;
  id?: string;
  activeCount?: number;
  limit?: number | null;
}

// Every id the form sends is checked against the signed-in user's own
// organization. The browser's choice is never trusted for scope.
async function validateScope(organizationId: string, input: FollowupFormInput): Promise<FollowupFormState | null> {
  const admin = createAdminClient();

  const { data: assignee } = await admin
    .from("organization_members")
    .select("role, tab_permissions")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", input.assigneeUserId)
    .maybeSingle();
  if (!assignee) {
    return { fieldErrors: { assigneeUserId: "That person isn't a member of this organization." } };
  }
  if (!canReceiveFollowupTasks(assignee.role as OrganizationRole, assignee.tab_permissions as TabPermissions | null)) {
    return { fieldErrors: { assigneeUserId: "That person doesn't have permission to work on To Do tasks." } };
  }

  if (!input.allBranches && input.branchIds.length > 0) {
    const { data: branches } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", input.branchIds);
    if ((branches ?? []).length !== input.branchIds.length) {
      return { error: "One of the selected branches isn't part of this organization." };
    }
  }

  return null;
}

function toConfig(input: FollowupFormInput) {
  return {
    description: input.description.trim(),
    requiredConsecutive: input.requiredConsecutive,
    runWeekday: input.runWeekday,
    branchIds: input.allBranches ? null : input.branchIds,
    assigneeUserId: input.assigneeUserId,
    dueWorkingDays: input.dueWorkingDays,
    priority: input.priority,
  };
}

function validateInput(input: FollowupFormInput): FollowupFormState | null {
  const fieldErrors: FollowupFormState["fieldErrors"] = validateFollowupConfig({
    requiredConsecutive: input.requiredConsecutive,
    runWeekday: input.runWeekday,
    assigneeUserId: input.assigneeUserId,
    dueWorkingDays: input.dueWorkingDays,
    priority: input.priority,
  });
  if (!input.name.trim()) {
    fieldErrors.name = "Give this automation a name.";
  }
  if (!input.allBranches && input.branchIds.length === 0) {
    return { error: "Choose at least one branch, or apply to all branches." };
  }
  return Object.values(fieldErrors).some(Boolean) ? { fieldErrors } : null;
}

async function gate(organizationId: string): Promise<string | null> {
  const access = await checkTabAccess(organizationId, "automations", "write");
  if (!access.ok) return access.message;
  const plan = await getPlanLimits(organizationId);
  if (plan.automationLimit === 0) return `Automation isn't included on the ${plan.name} plan.`;
  return null;
}

export async function createFollowupAutomation(input: FollowupFormInput): Promise<FollowupFormState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const gateError = await gate(organizationId);
  if (gateError) return { error: gateError };

  const invalid = validateInput(input);
  if (invalid) return invalid;
  const scopeError = await validateScope(organizationId, input);
  if (scopeError) return scopeError;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("automations")
    .insert({
      organization_id: organizationId,
      type: "member_followup",
      name: input.name.trim(),
      status: "draft" satisfies AutomationStatus,
      config: toConfig(input),
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't create that automation." };

  revalidatePath(AUTOMATIONS_PATH);
  if (input.status === "active") {
    // Saved as a draft first, then activated through the limit check. If the
    // plan is full the draft is kept and the user is told why.
    const activation = await setFollowupStatus(data.id, "active");
    return { id: data.id, ...activation, error: activation.error };
  }
  return { id: data.id };
}

export async function updateFollowupAutomation(id: string, input: FollowupFormInput): Promise<FollowupFormState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const gateError = await gate(organizationId);
  if (gateError) return { error: gateError };

  const invalid = validateInput(input);
  if (invalid) return invalid;
  const scopeError = await validateScope(organizationId, input);
  if (scopeError) return scopeError;

  const admin = createAdminClient();
  const { error } = await admin
    .from("automations")
    .update({ name: input.name.trim(), config: toConfig(input), updated_by: user.id })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("type", "member_followup");
  if (error) return { error: "Couldn't save those changes." };

  revalidatePath(AUTOMATIONS_PATH);
  return { id };
}

// Activation is the one place the active-automation limit is consumed. It
// runs under the database's per-organization lock, so concurrent activations
// can't exceed the plan's limit together.
export async function setFollowupStatus(
  id: string,
  status: "active" | "paused",
): Promise<FollowupFormState & { activeCount?: number; limit?: number | null }> {
  await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const gateError = await gate(organizationId);
  if (gateError) return { error: gateError };

  const admin = createAdminClient();

  if (status === "active") {
    const plan = await getPlanLimits(organizationId);
    const { data: activated, error: activateError } = await admin.rpc("activate_automation_within_limit", {
      p_org: organizationId,
      p_automation: id,
      p_limit: plan.automationLimit,
    });
    if (activateError) return { error: "Couldn't activate that automation." };
    if (!activated) {
      const quotaError = await checkAutomationQuota(organizationId);
      const { count } = await admin
        .from("automations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active");
      return {
        error: quotaError ?? `Your ${plan.name} plan's active automation limit has been reached.`,
        activeCount: count ?? 0,
        limit: plan.automationLimit,
      };
    }
  } else {
    const { error } = await admin
      .from("automations")
      .update({ status: "paused" })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("type", "member_followup");
    if (error) return { error: "Couldn't pause that automation." };
  }

  revalidatePath(AUTOMATIONS_PATH);
  return { id };
}
