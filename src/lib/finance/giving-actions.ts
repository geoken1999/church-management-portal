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
import { buildPaymentRequestFields, type PayUFormFields } from "@/lib/payu/client";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { FundraiserPaymentMode } from "@/types/database";

const FUNDRAISERS_PATH = "/dashboard/fundraisers";

export interface CreateGivingOrderState {
  error?: string;
  // 'shared' mode (the platform's own account) moved to PayU; 'own' mode (a
  // church's own Razorpay keys) hasn't — PayU has no equivalent of handing a
  // church its own merchant-level keys to plug in the way Razorpay Connect
  // does, so that would need its own, separate product decision later. This
  // return type carries both shapes and the caller switches on `gateway`.
  gateway?: "payu" | "razorpay";
  payuFields?: PayUFormFields;
  payuActionUrl?: string;
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
  const amount = Number(amountRaw);
  const donorName = donorNameRaw.trim();
  const organizationName = (fundraiser.organizations as { name: string } | null)?.name ?? "";

  if (paymentMode === "shared") {
    const txnid = `giving${Date.now()}${fundraiser.id.replace(/-/g, "").slice(0, 8)}`;
    const { error: insertError } = await admin.from("fundraiser_payment_orders").insert({
      organization_id: fundraiser.organization_id,
      fundraiser_id: fundraiser.id,
      payu_txnid: txnid,
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

    const siteUrl = getSiteUrl();
    const returnUrl = `${siteUrl}/api/payu/giving/return?token=${shareToken}`;

    let built;
    try {
      built = buildPaymentRequestFields({
        txnid,
        amountRupees: amount,
        productinfo: `Gift: ${fundraiser.title}`,
        firstname: donorName,
        email: donorEmail.trim() || `no-reply+${fundraiser.id}@kingdomflow.app`,
        phone: donorPhone.trim() || "9999999999",
        surl: returnUrl,
        furl: returnUrl,
        udf1: `giving:${fundraiser.id}`,
      });
    } catch (err) {
      await logPlatformEvent({
        level: "error",
        source: "fundraiser_giving",
        message: `PayU field build failed: ${err instanceof Error ? err.message : "unknown error"}`,
        organizationId: fundraiser.organization_id,
        metadata: { fundraiserId: fundraiser.id, txnid },
      });
      return { error: "Couldn't start the payment. Please try again." };
    }

    return {
      gateway: "payu",
      payuFields: built.fields,
      payuActionUrl: built.actionUrl,
      amount,
      fundraiserTitle: fundraiser.title,
      organizationName,
    };
  }

  // 'own' mode — unchanged, still Razorpay, against the church's own account.
  const credentials = await getGivingCredentials(fundraiser.organization_id, paymentMode);
  if (!credentials) {
    return { error: "This giving link isn't set up correctly yet. Please try again later." };
  }

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
    await logPlatformEvent({
      level: "error",
      source: "fundraiser_giving",
      message: "Razorpay giving order creation failed",
      organizationId: fundraiser.organization_id,
      metadata: { fundraiserId: fundraiser.id, paymentMode },
    });
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
    gateway: "razorpay",
    orderId: order.id,
    keyId: credentials.keyId,
    amount,
    fundraiserTitle: fundraiser.title,
    organizationName,
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
