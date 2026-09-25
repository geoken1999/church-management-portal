"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";

const PAYOUTS_PATH = "/platform-admin/payouts";

export interface RecordPayoutState {
  error?: string;
  success?: boolean;
}

// Purely a bookkeeping entry — recording a payout here does not itself
// move any money. It's how a platform operator marks that they've
// already wired funds to the church externally for a 'shared'-mode
// fundraiser.
export async function recordFundraiserPayout(_prevState: RecordPayoutState, formData: FormData): Promise<RecordPayoutState> {
  const user = await requirePlatformAdmin();

  const fundraiserId = String(formData.get("fundraiserId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const amount = Number(amountRaw);
  if (!amountRaw.trim() || Number.isNaN(amount) || amount <= 0) {
    return { error: "Enter an amount greater than 0." };
  }

  const admin = createAdminClient();
  const { data: payout, error } = await admin
    .from("fundraiser_payouts")
    .insert({
      organization_id: organizationId,
      fundraiser_id: fundraiserId,
      amount,
      note: note || null,
      paid_by: user.id,
    })
    .select("id")
    .single();

  if (error || !payout) {
    return { error: "Couldn't record that payout. Please try again." };
  }

  // Resolves whichever pending request this payout was for, if any — a
  // payout can also be recorded ad hoc with no request behind it, which
  // is left alone here.
  await admin
    .from("fundraiser_payout_requests")
    .update({ status: "paid", resolved_payout_id: payout.id })
    .eq("fundraiser_id", fundraiserId)
    .eq("status", "pending");

  revalidatePath(PAYOUTS_PATH);
  return { success: true };
}
