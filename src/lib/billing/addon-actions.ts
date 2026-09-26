"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayClient } from "@/lib/billing/razorpay";
import { getRazorpayEnv } from "@/lib/billing/env";
import { getAddonPack } from "@/lib/plans/config";
import { verifyGivingPaymentSignature } from "@/lib/finance/razorpay-giving";
import { sendAddonPurchaseEmail } from "@/lib/billing/receipts";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { AddonType } from "@/lib/plans/config";

const BILLING_PATH = "/dashboard/billing";

export interface CreateAddonOrderState {
  error?: string;
  orderId?: string;
  keyId?: string;
  amount?: number;
  packLabel?: string;
}

// Add-on packs are always sold by the platform (unlike Fund Raiser giving,
// there's no "own Razorpay account" mode here) — so this always uses the
// platform's own account, the same one subscription billing uses.
export async function createAddonOrder(packId: string): Promise<CreateAddonOrderState> {
  await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can manage billing." };
  }

  const pack = getAddonPack(packId);
  if (!pack) {
    return { error: "Select a valid add-on pack." };
  }

  const razorpay = createRazorpayClient();
  let order;
  try {
    order = await razorpay.orders.create({
      amount: Math.round(pack.priceInRupees * 100),
      currency: "INR",
      receipt: `addon_${membership.organization.id}_${Date.now()}`,
      notes: {
        kind: "addon_purchase",
        organization_id: membership.organization.id,
        pack_id: pack.id,
        addon_type: pack.addonType,
      },
    });
  } catch (err) {
    console.error("addon order creation failed:", err);
    await logPlatformEvent({
      level: "error",
      source: "addon_purchase",
      message: "Razorpay addon order creation failed",
      organizationId: membership.organization.id,
      metadata: { packId: pack.id },
    });
    return { error: "Couldn't start the payment. Please try again." };
  }

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("organization_addon_orders").insert({
    organization_id: membership.organization.id,
    addon_type: pack.addonType,
    pack_id: pack.id,
    credits: pack.credits,
    amount: pack.priceInRupees,
    razorpay_order_id: order.id,
  });

  if (insertError) {
    console.error("organization_addon_orders insert failed:", insertError.message);
    await logPlatformEvent({
      level: "error",
      source: "addon_purchase",
      message: `organization_addon_orders insert failed: ${insertError.message}`,
      organizationId: membership.organization.id,
      metadata: { packId: pack.id, razorpayOrderId: order.id },
    });
    return { error: "Couldn't start the payment. Please try again." };
  }

  return { orderId: order.id, keyId: getRazorpayEnv().keyId, amount: pack.priceInRupees, packLabel: pack.label };
}

export interface ConfirmAddonPaymentState {
  error?: string;
  success?: boolean;
}

export async function confirmAddonPayment(orderId: string, paymentId: string, signature: string): Promise<ConfirmAddonPaymentState> {
  await requireUser();

  const { keySecret } = getRazorpayEnv();
  if (!verifyGivingPaymentSignature(orderId, paymentId, signature, keySecret)) {
    return { error: "Couldn't verify this payment." };
  }

  const result = await finalizeAddonOrderPayment(orderId, paymentId);
  if (result.error) {
    return { error: result.error };
  }

  revalidatePath(BILLING_PATH);
  return { success: true };
}

export interface FinalizeAddonOrderResult {
  error?: string;
  success?: boolean;
}

// Shared by both confirmation paths (the Checkout success callback above,
// and the Razorpay webhook) — same atomic-claim idempotency pattern as
// finalizeGivingOrderPayment: whichever fires first wins, the status
// 'created' -> 'paid' UPDATE only matches once, so the balance can never
// be credited twice for the same order.
export async function finalizeAddonOrderPayment(razorpayOrderId: string, razorpayPaymentId: string): Promise<FinalizeAddonOrderResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("organization_addon_orders")
    .select("id, organization_id, addon_type, pack_id, credits, amount, status")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();

  if (!order) {
    return { error: "That payment could not be found." };
  }

  if (order.status === "paid") {
    return { success: true };
  }

  const { data: claimed } = await admin
    .from("organization_addon_orders")
    .update({ status: "paid", razorpay_payment_id: razorpayPaymentId, paid_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "created")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Lost the race (or already claimed earlier) — the other caller
    // already credited (or is about to credit) the balance.
    return { success: true };
  }

  const { data: org } = await admin
    .from("organizations")
    .select("addon_sms_credits, addon_email_credits, addon_whatsapp_credits, addon_storage_bytes")
    .eq("id", order.organization_id)
    .single();

  const addonType = order.addon_type as AddonType;
  const update =
    addonType === "sms"
      ? { addon_sms_credits: (org?.addon_sms_credits ?? 0) + order.credits }
      : addonType === "email"
        ? { addon_email_credits: (org?.addon_email_credits ?? 0) + order.credits }
        : addonType === "whatsapp"
          ? { addon_whatsapp_credits: (org?.addon_whatsapp_credits ?? 0) + order.credits }
          : { addon_storage_bytes: (org?.addon_storage_bytes ?? 0) + order.credits };

  await admin.from("organizations").update(update).eq("id", order.organization_id);

  await sendAddonPurchaseEmail(order.organization_id, getAddonPack(order.pack_id)?.label ?? order.addon_type, order.amount);

  return { success: true };
}
