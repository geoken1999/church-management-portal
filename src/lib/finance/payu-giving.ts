import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendGivingReceiptEmail } from "@/lib/finance/giving-receipt";
import { DEFAULT_TIMEZONE, dateKeyInTimezone } from "@/lib/organizations/timezone";

export interface FinalizePayUGivingOrderResult {
  error?: string;
  success?: boolean;
}

// The 'shared'-mode counterpart to razorpay-giving.ts's
// finalizeGivingOrderPayment — 'own' mode orders stay on that one, unchanged.
// Called only from the PayU return route (/api/payu/giving/return), after
// that route has verified PayU's hash — this function itself does no
// verification. Same atomic paid-once claim as the other PayU flows: the
// status-guarded UPDATE means a redelivered callback can't insert a second
// donation for the same payment.
export async function finalizePayUGivingOrderPayment(txnid: string, mihpayid: string): Promise<FinalizePayUGivingOrderResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("fundraiser_payment_orders")
    .select(
      "id, organization_id, fundraiser_id, amount, payment_mode, donor_name, donor_email, status, donation_id, fundraisers(title), organizations(name)",
    )
    .eq("payu_txnid", txnid)
    .maybeSingle();

  if (!order) {
    return { error: "That payment could not be found." };
  }

  if (order.status === "paid" && order.donation_id) {
    return { success: true };
  }

  const { data: claimed } = await admin
    .from("fundraiser_payment_orders")
    .update({ status: "paid", payu_mihpayid: mihpayid })
    .eq("id", order.id)
    .eq("status", "created")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Lost the race (or already claimed earlier) — nothing left to do.
    return { success: true };
  }

  // The church's calendar day, not the UTC day, so a gift made just after
  // midnight in India is dated the right day.
  const { data: org } = await admin.from("organizations").select("timezone").eq("id", order.organization_id).maybeSingle();
  const donatedOn = dateKeyInTimezone(new Date(), org?.timezone ?? DEFAULT_TIMEZONE);
  const { data: donation, error: donationError } = await admin
    .from("donations")
    .insert({
      organization_id: order.organization_id,
      fundraiser_id: order.fundraiser_id,
      amount: order.amount,
      donated_on: donatedOn,
      method: "online",
      payment_mode: order.payment_mode,
      donor_name: order.donor_name,
      notes: "Online gift via KingdomFlow's shared PayU account.",
    })
    .select("id")
    .single();

  if (donationError || !donation) {
    console.error("fundraiser giving donation insert failed:", donationError?.message);
    return { error: "Payment succeeded but couldn't be recorded. Please contact the church directly." };
  }

  await admin.from("fundraiser_payment_orders").update({ donation_id: donation.id }).eq("id", order.id);

  await sendGivingReceiptEmail({
    organizationId: order.organization_id,
    organizationName: (order.organizations as { name: string } | null)?.name ?? "Your church",
    fundraiserTitle: (order.fundraisers as { title: string } | null)?.title ?? "General fund",
    donorEmail: order.donor_email,
    donorName: order.donor_name,
    amount: order.amount,
    paymentId: mihpayid,
    donatedOn,
  });

  return { success: true };
}
