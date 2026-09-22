"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import {
  validateFundraiser,
  validateOffering,
  validateDonation,
  FUNDRAISER_STATUSES,
  DONATION_METHODS,
  type FundraiserFieldErrors,
  type OfferingFieldErrors,
  type DonationFieldErrors,
} from "@/lib/finance/validation";
import type { DonationMethod, FundraiserStatus } from "@/types/database";

const FUNDRAISERS_PATH = "/dashboard/fundraisers";
const OFFERINGS_PATH = "/dashboard/offerings";
const DONATIONS_PATH = "/dashboard/donations";

// Forms identifying an existing row only carry its id, not organizationId —
// looked up from the record itself before a permission check is possible.
// All three tables are RLS-restricted to admins by default (see migration
// 0041) — the admin client performs the actual write so a "member" role
// granted write/delete via the tab permissions matrix can still perform
// it; the checkTabAccess call is what actually gates who gets here.
async function organizationIdForRow(
  table: "fundraisers" | "offerings" | "donations",
  id: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from(table).select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

// The Finance module is gated by plan, on top of (and ahead of) the tab
// permissions matrix — a plan gate applies to the whole org, including the
// owner, whereas tab permissions only ever narrow what a "member" can do
// within a feature the org already has.
async function requireFinancePlan(organizationId: string): Promise<string | null> {
  const { plan } = await getPlanUsage(organizationId);
  if (!plan.financeEnabled) {
    return `Finance isn't included on the ${plan.name} plan.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fund raisers
// ---------------------------------------------------------------------------

export interface FundraiserFormState {
  error?: string;
  fieldErrors?: FundraiserFieldErrors;
  success?: boolean;
}

function readFundraiserFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? "").trim(),
    goalAmount: String(formData.get("goalAmount") ?? ""),
    branchId: String(formData.get("branchId") ?? "").trim(),
    managedBy: String(formData.get("managedBy") ?? "").trim(),
    startDate: String(formData.get("startDate") ?? "").trim(),
    endDate: String(formData.get("endDate") ?? "").trim(),
    status: String(formData.get("status") ?? "active"),
  };
}

export async function createFundraiser(
  _prevState: FundraiserFormState,
  formData: FormData,
): Promise<FundraiserFormState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const planError = await requireFinancePlan(organizationId);
  if (planError) {
    return { error: planError };
  }

  const access = await checkTabAccess(organizationId, "fundraisers", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const fields = readFundraiserFields(formData);
  const fieldErrors = validateFundraiser(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("fundraisers").insert({
    organization_id: organizationId,
    title: fields.title.trim(),
    description: fields.description || null,
    goal_amount: Number(fields.goalAmount),
    branch_id: fields.branchId || null,
    managed_by: fields.managedBy || null,
    start_date: fields.startDate || null,
    end_date: fields.endDate || null,
    status: (FUNDRAISER_STATUSES as readonly string[]).includes(fields.status)
      ? (fields.status as FundraiserStatus)
      : "active",
    created_by: user.id,
  });

  if (error) {
    return { error: "Couldn't add that fundraiser. Please try again." };
  }

  revalidatePath(FUNDRAISERS_PATH);
  return { success: true };
}

export async function updateFundraiser(
  _prevState: FundraiserFormState,
  formData: FormData,
): Promise<FundraiserFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("fundraisers", id);
  if (!organizationId) {
    return { error: "That fundraiser could not be found." };
  }
  const planError = await requireFinancePlan(organizationId);
  if (planError) {
    return { error: planError };
  }
  const access = await checkTabAccess(organizationId, "fundraisers", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const fields = readFundraiserFields(formData);
  const fieldErrors = validateFundraiser(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("fundraisers")
    .update({
      title: fields.title.trim(),
      description: fields.description || null,
      goal_amount: Number(fields.goalAmount),
      branch_id: fields.branchId || null,
      managed_by: fields.managedBy || null,
      start_date: fields.startDate || null,
      end_date: fields.endDate || null,
      status: (FUNDRAISER_STATUSES as readonly string[]).includes(fields.status)
        ? (fields.status as FundraiserStatus)
        : "active",
    })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath(FUNDRAISERS_PATH);
  return { success: true };
}

export async function deleteFundraiser(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("fundraisers", id);
  if (!organizationId) return;
  if (await requireFinancePlan(organizationId)) return;
  const access = await checkTabAccess(organizationId, "fundraisers", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("fundraisers").delete().eq("id", id);

  revalidatePath(FUNDRAISERS_PATH);
}

// ---------------------------------------------------------------------------
// Offerings
// ---------------------------------------------------------------------------

export interface OfferingFormState {
  error?: string;
  fieldErrors?: OfferingFieldErrors;
  success?: boolean;
}

function readOfferingFields(formData: FormData) {
  return {
    category: String(formData.get("category") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    collectedOn: String(formData.get("collectedOn") ?? "").trim(),
    branchId: String(formData.get("branchId") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function createOffering(
  _prevState: OfferingFormState,
  formData: FormData,
): Promise<OfferingFormState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const planError = await requireFinancePlan(organizationId);
  if (planError) {
    return { error: planError };
  }

  const access = await checkTabAccess(organizationId, "offerings", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const fields = readOfferingFields(formData);
  const fieldErrors = validateOffering(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("offerings").insert({
    organization_id: organizationId,
    category: fields.category.trim(),
    amount: Number(fields.amount),
    collected_on: fields.collectedOn,
    branch_id: fields.branchId || null,
    notes: fields.notes || null,
    recorded_by: user.id,
  });

  if (error) {
    return { error: "Couldn't record that offering. Please try again." };
  }

  revalidatePath(OFFERINGS_PATH);
  return { success: true };
}

export async function updateOffering(
  _prevState: OfferingFormState,
  formData: FormData,
): Promise<OfferingFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("offerings", id);
  if (!organizationId) {
    return { error: "That offering could not be found." };
  }
  const planError = await requireFinancePlan(organizationId);
  if (planError) {
    return { error: planError };
  }
  const access = await checkTabAccess(organizationId, "offerings", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const fields = readOfferingFields(formData);
  const fieldErrors = validateOffering(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("offerings")
    .update({
      category: fields.category.trim(),
      amount: Number(fields.amount),
      collected_on: fields.collectedOn,
      branch_id: fields.branchId || null,
      notes: fields.notes || null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath(OFFERINGS_PATH);
  return { success: true };
}

export async function deleteOffering(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("offerings", id);
  if (!organizationId) return;
  if (await requireFinancePlan(organizationId)) return;
  const access = await checkTabAccess(organizationId, "offerings", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("offerings").delete().eq("id", id);

  revalidatePath(OFFERINGS_PATH);
}

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

export interface DonationFormState {
  error?: string;
  fieldErrors?: DonationFieldErrors;
  success?: boolean;
}

function readDonationFields(formData: FormData) {
  return {
    memberId: String(formData.get("memberId") ?? "").trim(),
    donorName: String(formData.get("donorName") ?? "").trim(),
    amount: String(formData.get("amount") ?? ""),
    donatedOn: String(formData.get("donatedOn") ?? "").trim(),
    method: String(formData.get("method") ?? "cash"),
    fundraiserId: String(formData.get("fundraiserId") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function createDonation(
  _prevState: DonationFormState,
  formData: FormData,
): Promise<DonationFormState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const planError = await requireFinancePlan(organizationId);
  if (planError) {
    return { error: planError };
  }

  const access = await checkTabAccess(organizationId, "donations", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const fields = readDonationFields(formData);
  const fieldErrors = validateDonation(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("donations").insert({
    organization_id: organizationId,
    member_id: fields.memberId || null,
    donor_name: fields.memberId ? null : fields.donorName || null,
    amount: Number(fields.amount),
    donated_on: fields.donatedOn,
    method: (DONATION_METHODS as readonly string[]).includes(fields.method)
      ? (fields.method as DonationMethod)
      : "cash",
    fundraiser_id: fields.fundraiserId || null,
    notes: fields.notes || null,
    recorded_by: user.id,
  });

  if (error) {
    return { error: "Couldn't record that donation. Please try again." };
  }

  revalidatePath(DONATIONS_PATH);
  revalidatePath(FUNDRAISERS_PATH);
  return { success: true };
}

export async function updateDonation(
  _prevState: DonationFormState,
  formData: FormData,
): Promise<DonationFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("donations", id);
  if (!organizationId) {
    return { error: "That donation could not be found." };
  }
  const planError = await requireFinancePlan(organizationId);
  if (planError) {
    return { error: planError };
  }
  const access = await checkTabAccess(organizationId, "donations", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const fields = readDonationFields(formData);
  const fieldErrors = validateDonation(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("donations")
    .update({
      member_id: fields.memberId || null,
      donor_name: fields.memberId ? null : fields.donorName || null,
      amount: Number(fields.amount),
      donated_on: fields.donatedOn,
      method: (DONATION_METHODS as readonly string[]).includes(fields.method)
        ? (fields.method as DonationMethod)
        : "cash",
      fundraiser_id: fields.fundraiserId || null,
      notes: fields.notes || null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath(DONATIONS_PATH);
  revalidatePath(FUNDRAISERS_PATH);
  return { success: true };
}

export async function deleteDonation(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("donations", id);
  if (!organizationId) return;
  if (await requireFinancePlan(organizationId)) return;
  const access = await checkTabAccess(organizationId, "donations", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("donations").delete().eq("id", id);

  revalidatePath(DONATIONS_PATH);
  revalidatePath(FUNDRAISERS_PATH);
}
