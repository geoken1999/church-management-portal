"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { getLeaderMembers } from "@/lib/leaders/dal";
import { validatePlan, validateItemTimeRange, PLAN_STATUSES, type PlanFieldErrors } from "@/lib/planner/validation";
import { buildPlanPdf } from "@/lib/planner/export";
import type { PlanItem, PlanStatus } from "@/types/database";

const PLANNER_PATH = "/dashboard/planner";

function readPlanFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    status: String(formData.get("status") ?? "draft"),
    targetDate: String(formData.get("targetDate") ?? "").trim(),
  };
}

// updatePlan/deletePlan/togglePlanItem/addPlanItem/deletePlanItem forms only
// carry the plan id, not organizationId — looked up from the record itself
// before a permission check is possible, same pattern as todos/actions.ts.
async function organizationIdForPlan(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("plans").select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

async function currentItems(id: string): Promise<PlanItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("plans").select("items").eq("id", id).maybeSingle();
  return data?.items ?? [];
}

export interface PlanFormState {
  error?: string;
  fieldErrors?: PlanFieldErrors;
  success?: boolean;
}

export async function createPlan(_prevState: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const user = await requireUser();
  const membership = await requireOrganization();

  if (!membership.tabAccess.planner.write) {
    return { error: "You don't have permission to create plans." };
  }

  const fields = readPlanFields(formData);
  const fieldErrors = validatePlan(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("plans").insert({
    organization_id: membership.organization.id,
    title: fields.title,
    notes: fields.notes || null,
    status: (PLAN_STATUSES.includes(fields.status as PlanStatus) ? fields.status : "draft") as PlanStatus,
    target_date: fields.targetDate || null,
    created_by: user.id,
  });

  if (error) {
    return { error: "Couldn't create that plan. Please try again." };
  }

  revalidatePath(PLANNER_PATH);
  return { success: true };
}

export async function updatePlan(_prevState: PlanFormState, formData: FormData): Promise<PlanFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForPlan(id);
  if (!organizationId) {
    return { error: "That plan could not be found." };
  }
  const access = await checkTabAccess(organizationId, "planner", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const fields = readPlanFields(formData);
  const fieldErrors = validatePlan(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("plans")
    .update({
      title: fields.title,
      notes: fields.notes || null,
      status: (PLAN_STATUSES.includes(fields.status as PlanStatus) ? fields.status : "draft") as PlanStatus,
      target_date: fields.targetDate || null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath(PLANNER_PATH);
  return { success: true };
}

export async function deletePlan(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForPlan(id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "planner", "delete");
  if (!access.ok) return;

  const supabase = await createClient();
  await supabase.from("plans").delete().eq("id", id);

  revalidatePath(PLANNER_PATH);
}

// The three item-level actions below all read-modify-write the plan's
// `items` jsonb array — there's no separate table for checklist items (see
// migration 0086's doc comment), so each of these is a small round trip
// rather than a single targeted column update. Fine at the size a
// checklist actually reaches; not built for hundreds of items.

export interface AddPlanItemState {
  error?: string;
}

export async function addPlanItem(formData: FormData): Promise<AddPlanItemState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "").trim();
  const endTime = String(formData.get("endTime") ?? "").trim();
  if (!text) return {};

  const timeError = validateItemTimeRange(startTime, endTime);
  if (timeError) return { error: timeError };

  const organizationId = await organizationIdForPlan(id);
  if (!organizationId) return { error: "That plan could not be found." };
  const access = await checkTabAccess(organizationId, "planner", "write");
  if (!access.ok) return { error: access.message };

  const assignedTo = String(formData.get("assignedTo") ?? "").trim();

  const items = await currentItems(id);
  const nextItems: PlanItem[] = [
    ...items,
    {
      id: crypto.randomUUID(),
      text,
      done: false,
      startTime: startTime || null,
      endTime: endTime || null,
      assignedTo: assignedTo || null,
    },
  ];

  const supabase = await createClient();
  await supabase.from("plans").update({ items: nextItems }).eq("id", id);

  revalidatePath(PLANNER_PATH);
  return {};
}

export async function togglePlanItem(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const itemId = String(formData.get("itemId") ?? "");

  const organizationId = await organizationIdForPlan(id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "planner", "write");
  if (!access.ok) return;

  const items = await currentItems(id);
  const nextItems = items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item));

  const supabase = await createClient();
  await supabase.from("plans").update({ items: nextItems }).eq("id", id);

  revalidatePath(PLANNER_PATH);
}

export async function assignPlanItem(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const assignedTo = String(formData.get("assignedTo") ?? "").trim();

  const organizationId = await organizationIdForPlan(id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "planner", "write");
  if (!access.ok) return;

  const items = await currentItems(id);
  const nextItems = items.map((item) => (item.id === itemId ? { ...item, assignedTo: assignedTo || null } : item));

  const supabase = await createClient();
  await supabase.from("plans").update({ items: nextItems }).eq("id", id);

  revalidatePath(PLANNER_PATH);
}

export async function deletePlanItem(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const itemId = String(formData.get("itemId") ?? "");

  const organizationId = await organizationIdForPlan(id);
  if (!organizationId) return;
  const access = await checkTabAccess(organizationId, "planner", "write");
  if (!access.ok) return;

  const items = await currentItems(id);
  const nextItems = items.filter((item) => item.id !== itemId);

  const supabase = await createClient();
  await supabase.from("plans").update({ items: nextItems }).eq("id", id);

  revalidatePath(PLANNER_PATH);
}

export interface ExportPlanPdfState {
  error?: string;
  base64?: string;
  filename?: string;
  mimeType?: string;
}

// Deliberately restricted to Active plans — a Draft is still being figured
// out and a Completed one is history, so the "hand this to the team as a
// run sheet" use case this exists for only really applies while a plan is
// the one currently being executed. Enforced here, not just by hiding the
// button client-side.
export async function exportPlanPdf(planId: string): Promise<ExportPlanPdfState> {
  await requireUser();

  const supabase = await createClient();
  const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).maybeSingle();
  if (!plan) {
    return { error: "That plan could not be found." };
  }

  const access = await checkTabAccess(plan.organization_id, "planner", "read");
  if (!access.ok) {
    return { error: access.message };
  }

  if (plan.status !== "active") {
    return { error: "Only an Active plan can be exported as a PDF." };
  }

  const admin = createAdminClient();
  const [{ data: organization }, leaders] = await Promise.all([
    admin.from("organizations").select("name, slug").eq("id", plan.organization_id).maybeSingle(),
    getLeaderMembers(plan.organization_id),
  ]);

  const leaderNameById = new Map(leaders.map((leader) => [leader.id, `${leader.first_name} ${leader.last_name}`]));

  const bytes = buildPlanPdf(plan, organization?.name ?? "Plan", leaderNameById);
  const slug = organization?.slug ?? "plan";
  const titleSlug = plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  return {
    base64: Buffer.from(bytes).toString("base64"),
    filename: `${slug}-${titleSlug || "plan"}.pdf`,
    mimeType: "application/pdf",
  };
}
