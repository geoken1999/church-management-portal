"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFinancePlan } from "@/lib/finance/actions";
import { validateGivingAmount, validateDonorName } from "@/lib/finance/validation";
import {
  getGivingCredentials,
  createGivingRazorpayClient,
  verifyGivingPaymentSignature,
  finalizeGivingOrderPayment,
} from "@/lib/finance/razorpay-giving";
import type { FundraiserPaymentMode } from "@/types/database";

const FUNDRAISERS_PATH = "/dashboard/fundraisers";

export interface CreateGivingOrderState {
  error?: string;
  orderId?: string;
  keyId?: string;
  amount?: number;
  fundraiserTitle?: string;
  organizationName?: string;
}

// Called from the public /give/[token] page — no authenticated session, so
// every lookup and write here goes through the admin client. Re-validates
// the link is actually live rather than trusting the page's own server
// render, since the two can drift (link disabled between page load and
// submit, plan downgraded, etc.).
export async function createGivingOrder(
  shareToken: string,
  amountRaw: string,
  donorNameRaw: string,
  donorEmail: string,
  donorPhone: string,
): Promise<CreateGivingOrderState> {
  const amountError = validateGivingAmount(amountRaw);
  if (amountError) return { error: amountError };
  const donorNameError = validateDonorName(donorNameRaw);
  if (donorNameError) return { error: donorNameError };

  const admin = createAdminClient();
  const { data: fundraiser } = await admin
    .from("fundraisers")
    .select("id, organization_id, title, payment_mode, payment_link_enabled, organizations(name)")
    .eq("share_token", shareToken)
    .maybeSingle();

  if (!fundraiser || !fundraiser.payment_link_enabled || !fundraiser.payment_mode) {
    return { error: "This giving link is no longer available." };
  }

  const planError = await requireFinancePlan(fundraiser.organization_id);
  if (planError) {
    return { error: "This giving link is temporarily unavailable." };
  }

  const paymentMode = fundraiser.payment_mode as FundraiserPaymentMode;
  const credentials = await getGivingCredentials(fundraiser.organization_id, paymentMode);
  if (!credentials) {
    return { error: "This giving link isn't set up correctly yet. Please try again later." };
  }

  const amount = Number(amountRaw);
  const donorName = donorNameRaw.trim();

  let order;
  try {
    const client = createGivingRazorpayClient(credentials);
    order = await client.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `fr_${fundraiser.id}_${Date.now()}`,
      notes: {
        kind: "fundraiser_giving",
        fundraiser_id: fundraiser.id,
        organization_id: fundraiser.organization_id,
        payment_mode: paymentMode,
      },
    });
  } catch (err) {
    console.error("fundraiser giving order creation failed:", err);
    return { error: "Couldn't start the payment. Please try again." };
  }

  const { error: insertError } = await admin.from("fundraiser_payment_orders").insert({
    organization_id: fundraiser.organization_id,
    fundraiser_id: fundraiser.id,
    razorpay_order_id: order.id,
    amount,
    payment_mode: paymentMode,
    donor_name: donorName,
    donor_email: donorEmail.trim() || null,
    donor_phone: donorPhone.trim() || null,
  });

  if (insertError) {
    console.error("fundraiser_payment_orders insert failed:", insertError.message);
    return { error: "Couldn't start the payment. Please try again." };
  }

  return {
    orderId: order.id,
    keyId: credentials.keyId,
    amount,
    fundraiserTitle: fundraiser.title,
    organizationName: (fundraiser.organizations as { name: string } | null)?.name ?? "",
  };
}

export interface ConfirmGivingPaymentState {
  error?: string;
  success?: boolean;
}

export async function confirmGivingPayment(
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<ConfirmGivingPaymentState> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("fundraiser_payment_orders")
    .select("organization_id, payment_mode")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();

  if (!order) {
    return { error: "That payment could not be found." };
  }

  const credentials = await getGivingCredentials(order.organization_id, order.payment_mode);
  if (!credentials) {
    return { error: "Couldn't verify this payment. Please contact the church directly." };
  }

  if (!verifyGivingPaymentSignature(orderId, paymentId, signature, credentials.keySecret)) {
    return { error: "Couldn't verify this payment." };
  }

  const result = await finalizeGivingOrderPayment(orderId, paymentId);
  if (result.error) {
    return { error: result.error };
  }

  revalidatePath(FUNDRAISERS_PATH);
  return { success: true };
}
