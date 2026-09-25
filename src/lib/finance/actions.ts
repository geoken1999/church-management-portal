"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { sharedServiceNetAmount } from "@/lib/finance/fees";
import {
  validateFundraiser,
  validateOffering,
  validateDonation,
  validateRazorpayKeyId,
  validateRazorpayKeySecret,
  FUNDRAISER_STATUSES,
  DONATION_METHODS,
  type FundraiserFieldErrors,
  type OfferingFieldErrors,
  type DonationFieldErrors,
} from "@/lib/finance/validation";
import type { DonationMethod, FundraiserPaymentMode, FundraiserStatus } from "@/types/database";

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
// Connecting/removing the org's own Razorpay credentials is gated to
// owner/admin specifically — unlike ordinary fundraiser edits, this isn't
// something the tab-permissions matrix should be able to delegate to a
// regular staff login, since it controls where real donation money flows.
async function requireOrgAdmin(organizationId: string, authUserId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}

export async function requireFinancePlan(organizationId: string): Promise<string | null> {
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

// ---------------------------------------------------------------------------
// Fund Raiser giving links — the church's own Razorpay account, and
// per-fundraiser payment mode
// ---------------------------------------------------------------------------

export interface RazorpayAccountState {
  error?: string;
  success?: boolean;
}

export async function saveOwnRazorpayAccount(
  _prevState: RazorpayAccountState,
  formData: FormData,
): Promise<RazorpayAccountState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  if (await requireFinancePlan(organizationId)) {
    return { error: "Finance isn't included on your current plan." };
  }
  if (!(await requireOrgAdmin(organizationId, user.id))) {
    return { error: "Only an owner or admin can connect a Razorpay account." };
  }

  const keyId = String(formData.get("keyId") ?? "").trim();
  const keySecret = String(formData.get("keySecret") ?? "").trim();
  const keyIdError = validateRazorpayKeyId(keyId);
  if (keyIdError) return { error: keyIdError };
  const keySecretError = validateRazorpayKeySecret(keySecret);
  if (keySecretError) return { error: keySecretError };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_razorpay_accounts")
    .upsert({ organization_id: organizationId, key_id: keyId, key_secret: keySecret, connected_by: user.id }, { onConflict: "organization_id" });

  if (error) {
    return { error: "Couldn't save that Razorpay account. Please try again." };
  }

  revalidatePath(FUNDRAISERS_PATH);
  return { success: true };
}

export async function removeOwnRazorpayAccount(formData: FormData) {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  if (await requireFinancePlan(organizationId)) return;
  if (!(await requireOrgAdmin(organizationId, user.id))) return;

  const admin = createAdminClient();
  await admin.from("organization_razorpay_accounts").delete().eq("organization_id", organizationId);

  // Any fundraiser relying on the account that just disappeared would
  // otherwise keep a live public link that can never actually complete a
  // payment — turn those off rather than leave a broken link standing.
  await admin
    .from("fundraisers")
    .update({ payment_mode: null, payment_link_enabled: false })
    .eq("organization_id", organizationId)
    .eq("payment_mode", "own");

  revalidatePath(FUNDRAISERS_PATH);
}

export interface FundraiserPaymentSettingsState {
  error?: string;
  success?: boolean;
}

export async function updateFundraiserPaymentSettings(
  _prevState: FundraiserPaymentSettingsState,
  formData: FormData,
): Promise<FundraiserPaymentSettingsState> {
  await requireUser();
  const fundraiserId = String(formData.get("fundraiserId") ?? "");

  const organizationId = await organizationIdForRow("fundraisers", fundraiserId);
  if (!organizationId) {
    return { error: "That fundraiser could not be found." };
  }
  if (await requireFinancePlan(organizationId)) {
    return { error: "Finance isn't included on your current plan." };
  }
  const access = await checkTabAccess(organizationId, "fundraisers", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const modeRaw = String(formData.get("paymentMode") ?? "none");
  const enabled = formData.get("enabled") === "on";

  if (modeRaw === "none") {
    const admin = createAdminClient();
    await admin.from("fundraisers").update({ payment_mode: null, payment_link_enabled: false }).eq("id", fundraiserId);
    revalidatePath(FUNDRAISERS_PATH);
    return { success: true };
  }

  if (modeRaw !== "own" && modeRaw !== "shared") {
    return { error: "Choose a valid payment mode." };
  }
  const paymentMode = modeRaw as FundraiserPaymentMode;

  if (paymentMode === "own") {
    const admin = createAdminClient();
    const { data: account } = await admin
      .from("organization_razorpay_accounts")
      .select("id")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!account) {
      return { error: "Connect your Razorpay account first." };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("fundraisers")
    .update({ payment_mode: paymentMode, payment_link_enabled: enabled })
    .eq("id", fundraiserId);

  if (error) {
    return { error: "Couldn't save the payment link settings. Please try again." };
  }

  revalidatePath(FUNDRAISERS_PATH);
  return { success: true };
}

export interface PayoutRequestState {
  error?: string;
  success?: boolean;
}

// Asks the platform to pay out a 'shared'-mode fundraiser's collected
// balance — this only ever creates a request row; see
// /platform-admin/payouts for where it's actually fulfilled (still a
// manual bank transfer, recorded there once done).
export async function requestFundraiserPayout(
  _prevState: PayoutRequestState,
  formData: FormData,
): Promise<PayoutRequestState> {
  const user = await requireUser();
  const fundraiserId = String(formData.get("fundraiserId") ?? "");

  const organizationId = await organizationIdForRow("fundraisers", fundraiserId);
  if (!organizationId) {
    return { error: "That fundraiser could not be found." };
  }
  if (await requireFinancePlan(organizationId)) {
    return { error: "Finance isn't included on your current plan." };
  }
  const access = await checkTabAccess(organizationId, "fundraisers", "write");
  if (!access.ok) {
    return { error: access.message };
  }

  const admin = createAdminClient();

  // Computed fresh here rather than trusting a client-submitted amount —
  // this is what actually gets requested from the platform.
  const [{ data: fundraiser }, { data: donations }, { data: payouts }, { data: existingPending }] = await Promise.all([
    admin.from("fundraisers").select("payment_mode").eq("id", fundraiserId).maybeSingle(),
    admin.from("donations").select("amount").eq("fundraiser_id", fundraiserId).eq("payment_mode", "shared"),
    admin.from("fundraiser_payouts").select("amount").eq("fundraiser_id", fundraiserId),
    admin.from("fundraiser_payout_requests").select("id").eq("fundraiser_id", fundraiserId).eq("status", "pending").maybeSingle(),
  ]);

  if (!fundraiser || fundraiser.payment_mode !== "shared") {
    return { error: "This fundraiser isn't using the shared service." };
  }
  if (existingPending) {
    return { error: "A payout request is already pending for this fundraiser." };
  }

  const collected = (donations ?? []).reduce((sum, row) => sum + row.amount, 0);
  const paidOut = (payouts ?? []).reduce((sum, row) => sum + row.amount, 0);
  const owed = sharedServiceNetAmount(collected) - paidOut;

  if (owed <= 0) {
    return { error: "There's nothing owed to request a payout for." };
  }

  const { error } = await admin.from("fundraiser_payout_requests").insert({
    organization_id: organizationId,
    fundraiser_id: fundraiserId,
    amount: owed,
    requested_by: user.id,
  });

  if (error) {
    return { error: "Couldn't submit that payout request. Please try again." };
  }

  revalidatePath(FUNDRAISERS_PATH);
  return { success: true };
}

export async function cancelFundraiserPayoutRequest(formData: FormData) {
  await requireUser();
  const requestId = String(formData.get("requestId") ?? "");

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("fundraiser_payout_requests")
    .select("organization_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.status !== "pending") return;

  if (await requireFinancePlan(request.organization_id)) return;
  const access = await checkTabAccess(request.organization_id, "fundraisers", "write");
  if (!access.ok) return;

  await admin.from("fundraiser_payout_requests").update({ status: "cancelled" }).eq("id", requestId);

  revalidatePath(FUNDRAISERS_PATH);
}
