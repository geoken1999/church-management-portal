"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { validatePayoutDetails, type PayoutDetailsErrors } from "@/lib/organizations/payout-details";
import type { PayoutMethod } from "@/types/database";

const BILLING_PATH = "/dashboard/billing";

// Duplicated per-module on purpose — this codebase doesn't share one
// requireOrgAdmin helper across files (see the near-identical check in
// src/lib/finance/actions.ts); each module keeps its own small copy.
export async function requireOrgAdmin(organizationId: string, authUserId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}

export interface SavePayoutDetailsState {
  error?: string;
  fieldErrors?: PayoutDetailsErrors;
  success?: boolean;
}

// Where the platform should wire money for this org's Fund Raiser and
// Event payouts — one shared profile, editable from the Billing page or
// inline from either payout-request flow. Writing this is admin-only
// (see requireOrgAdmin above) even though requesting a payout itself only
// needs "write" tab access on fundraisers/events — this profile controls
// where real money gets sent, same sensitivity bar as connecting a
// Razorpay account (saveOwnRazorpayAccount, src/lib/finance/actions.ts).
export async function savePayoutDetails(
  _prevState: SavePayoutDetailsState,
  formData: FormData,
): Promise<SavePayoutDetailsState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  if (!(await requireOrgAdmin(organizationId, user.id))) {
    return { error: "Only an owner or admin can update payout details." };
  }

  const input = {
    payoutMethod: String(formData.get("payoutMethod") ?? ""),
    upiId: String(formData.get("upiId") ?? "").trim(),
    bankAccountHolder: String(formData.get("bankAccountHolder") ?? "").trim(),
    bankAccountNumber: String(formData.get("bankAccountNumber") ?? "").trim(),
    bankIfsc: String(formData.get("bankIfsc") ?? "").trim(),
    bankName: String(formData.get("bankName") ?? "").trim(),
  };

  const fieldErrors = validatePayoutDetails(input);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("organization_payout_details").upsert(
    {
      organization_id: organizationId,
      payout_method: input.payoutMethod as PayoutMethod,
      upi_id: input.payoutMethod === "upi" ? input.upiId : null,
      bank_account_holder: input.payoutMethod === "bank_transfer" ? input.bankAccountHolder : null,
      bank_account_number: input.payoutMethod === "bank_transfer" ? input.bankAccountNumber : null,
      bank_ifsc: input.payoutMethod === "bank_transfer" ? input.bankIfsc : null,
      bank_name: input.payoutMethod === "bank_transfer" ? input.bankName : null,
      updated_by: user.id,
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    return { error: "Couldn't save your payout details. Please try again." };
  }

  revalidatePath(BILLING_PATH);
  return { success: true };
}
