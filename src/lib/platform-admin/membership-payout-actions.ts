"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { sendMembershipPayoutProcessedEmail } from "@/lib/billing/receipts";
import { logPlatformEvent } from "@/lib/platform-events/log";

const PAYOUTS_PATH = "/platform-admin/payouts";

export interface RecordMembershipPayoutState {
  error?: string;
  success?: boolean;
}

// Bookkeeping, like the fundraiser and event payouts: it doesn't move money.
// It records that the balance was wired to the church outside the app.
export async function recordMembershipPayout(
  _prevState: RecordMembershipPayoutState,
  formData: FormData,
): Promise<RecordMembershipPayoutState> {
  const user = await requirePlatformAdmin();

  const organizationId = String(formData.get("organizationId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = Number(amountRaw);
  if (!organizationId) return { error: "That church could not be found." };
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Enter an amount greater than 0." };
  }

  const admin = createAdminClient();
  const { data: payout, error } = await admin
    .from("membership_payouts")
    .insert({ organization_id: organizationId, amount, note: note || null, paid_by: user.id })
    .select("id")
    .single();
  if (error || !payout) {
    return { error: "Couldn't record that payout. Please try again." };
  }

  await admin
    .from("membership_payout_requests")
    .update({ status: "paid", resolved_payout_id: payout.id })
    .eq("organization_id", organizationId)
    .eq("status", "pending");

  await sendMembershipPayoutProcessedEmail(organizationId, amount);
  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Recorded membership fee payout of ${amount}`,
    organizationId,
    metadata: { payoutId: payout.id },
  });

  revalidatePath(PAYOUTS_PATH);
  return { success: true };
}
