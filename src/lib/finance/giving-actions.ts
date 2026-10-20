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
import { buildPaymentRequestFields, type PayUAccount, type PayUFormFields } from "@/lib/payu/client";
import { createCheckout } from "@/lib/razorpay/platform";
import type { RazorpayCheckout } from "@/lib/razorpay/checkout";
import { createCashfreeOrder } from "@/lib/cashfree/client";
import { getOwnAccount } from "@/lib/payments/own-accounts";
import { payuBaseUrl, type Gateway } from "@/lib/payments/gateways";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { GIVING_TYPE_LABELS, isGivingType, type GivingType } from "@/lib/finance/giving-types";
import type { FundraiserPaymentMode } from "@/types/database";

const FUNDRAISERS_PATH = "/dashboard/fundraisers";

export interface CreateGivingOrderState {
  error?: string;
  // 'shared' mode uses KingdomFlow's own Razorpay account (`checkout`); 'own' mode uses the church's
  // own gateway keys. This return type carries every shape and the caller switches on `gateway`.
  gateway?: "payu" | "razorpay" | "cashfree";
  // Cashfree: the session the browser opens checkout with, and its mode.
  cashfreeSessionId?: string;
  cashfreeMode?: "production" | "sandbox";
  payuFields?: PayUFormFields;
  payuActionUrl?: string;
  // Shared mode: the order on KingdomFlow's own Razorpay account.
  checkout?: RazorpayCheckout;
  orderId?: string;
  keyId?: string;
  amount?: number;
  fundraiserTitle?: string;
  organizationName?: string;
}

interface GivingTarget {
  organizationId: string;
  organizationName: string;
  paymentMode: FundraiserPaymentMode;
  // The gateway behind 'own' mode (ignored for 'shared', which is always KingdomFlow's Razorpay).
  ownGateway: Gateway;
  // null for a church-wide gift (offering / tithe / donation).
  fundraiserId: string | null;
  givingType: "fundraiser" | GivingType;
  // What the gift is for, shown at checkout ("Tithe", or the fundraiser's title).
  title: string;
  // Where the PayU return should land, and how to find the page again.
  returnPath: string;
  referenceId: string;
}

// Starts the payment for a validated gift: records a payment order and returns
// what the browser needs to take the money — an order on the platform's own
// Razorpay account ('shared' mode) or one on the church's own gateway ('own' mode). Shared by fundraiser giving and church-wide giving.
async function startGivingPayment(
  target: GivingTarget,
  amount: number,
  donorName: string,
  donorEmail: string,
  donorPhone: string,
): Promise<CreateGivingOrderState> {
  const admin = createAdminClient();
  const planError = await requireFinancePlan(target.organizationId);
  if (planError) {
    return { error: "This giving link is temporarily unavailable." };
  }

  const orderBase = {
    organization_id: target.organizationId,
    fundraiser_id: target.fundraiserId,
    giving_type: target.givingType,
    amount,
    payment_mode: target.paymentMode,
    donor_name: donorName,
    donor_email: donorEmail.trim() || null,
    donor_phone: donorPhone.trim() || null,
  };

  if (target.paymentMode === "shared") {
    // Our own reference rides in payu_txnid (a column name from before Razorpay) and as the Razorpay receipt.
    const txnid = `giving${Date.now()}${target.referenceId.replace(/-/g, "").slice(0, 8)}`;
    let checkout;
    try {
      checkout = await createCheckout({
        receipt: txnid,
        amountRupees: amount,
        name: target.organizationName || "KingdomFlow",
        description: `Gift: ${target.title}`.slice(0, 100),
        prefill: { name: donorName, email: donorEmail.trim() || undefined, contact: donorPhone.trim() || undefined },
        callbackUrl: `${getSiteUrl()}${target.returnPath.replace("/api/payu/giving/return", "/api/razorpay/giving/return")}`,
        notes: { kind: "giving", giving_type: target.givingType },
      });
    } catch (err) {
      await logPlatformEvent({
        level: "error",
        source: "fundraiser_giving",
        message: `Razorpay order creation failed: ${err instanceof Error ? err.message : "unknown error"}`,
        organizationId: target.organizationId,
        metadata: { referenceId: target.referenceId, txnid },
      });
      return { error: "Couldn't start the payment. Please try again." };
    }
    const { error: insertError } = await admin.from("fundraiser_payment_orders").insert({ ...orderBase, gateway: "razorpay", payu_txnid: txnid });
    if (insertError) {
      console.error("fundraiser_payment_orders insert failed:", insertError.message);
      return { error: "Couldn't start the payment. Please try again." };
    }
    return { gateway: "razorpay", checkout, amount, fundraiserTitle: target.title, organizationName: target.organizationName };
  }

  const gateway: Gateway = target.ownGateway;

  if (gateway === "payu") {
    // The church's own PayU account.
    const own = await getOwnAccount(target.organizationId, "payu");
    if (!own) return { error: "This giving link isn't set up correctly yet. Please try again later." };
    const account: PayUAccount = { merchantKey: own.keyId, salt: own.keySecret, baseUrl: payuBaseUrl(own.environment) };

    const txnid = `giving${Date.now()}${target.referenceId.replace(/-/g, "").slice(0, 8)}`;
    const { error: insertError } = await admin.from("fundraiser_payment_orders").insert({ ...orderBase, gateway: "payu", payu_txnid: txnid });
    if (insertError) {
      console.error("fundraiser_payment_orders insert failed:", insertError.message);
      return { error: "Couldn't start the payment. Please try again." };
    }

    const returnUrl = `${getSiteUrl()}${target.returnPath}&own=1`;

    let built;
    try {
      built = buildPaymentRequestFields(
        {
          txnid,
          amountRupees: amount,
          productinfo: `Gift: ${target.title}`,
          firstname: donorName,
          email: donorEmail.trim() || `no-reply+${target.referenceId}@kingdomflow.app`,
          phone: donorPhone.trim() || "9999999999",
          surl: returnUrl,
          furl: returnUrl,
          udf1: `giving:${target.referenceId}`,
        },
        account,
      );
    } catch (err) {
      await logPlatformEvent({
        level: "error",
        source: "fundraiser_giving",
        message: `PayU field build failed: ${err instanceof Error ? err.message : "unknown error"}`,
        organizationId: target.organizationId,
        metadata: { referenceId: target.referenceId, txnid },
      });
      return { error: "Couldn't start the payment. Please try again." };
    }

    return {
      gateway: "payu",
      payuFields: built.fields,
      payuActionUrl: built.actionUrl,
      amount,
      fundraiserTitle: target.title,
      organizationName: target.organizationName,
    };
  }

  if (gateway === "cashfree") {
    const own = await getOwnAccount(target.organizationId, "cashfree");
    if (!own) return { error: "This giving link isn't set up correctly yet. Please try again later." };

    const orderId = `cf${Date.now()}${target.referenceId.replace(/-/g, "").slice(0, 8)}`;
    const returnUrl = `${getSiteUrl()}/api/cashfree/giving/return?order_id={order_id}&${target.returnPath.split("?")[1] ?? ""}`;
    const created = await createCashfreeOrder(
      { appId: own.keyId, secretKey: own.keySecret, environment: own.environment },
      {
        orderId,
        amount,
        customerId: `giver_${Date.now()}`,
        customerName: donorName,
        customerEmail: donorEmail.trim() || `no-reply+${target.referenceId}@kingdomflow.app`,
        customerPhone: donorPhone.trim() || "9999999999",
        returnUrl,
        note: `Gift: ${target.title}`,
      },
    );
    if ("error" in created) {
      await logPlatformEvent({
        level: "error",
        source: "fundraiser_giving",
        message: `Cashfree order creation failed: ${created.error}`,
        organizationId: target.organizationId,
        metadata: { referenceId: target.referenceId },
      });
      return { error: "Couldn't start the payment. Please try again." };
    }

    const { error: insertError } = await admin.from("fundraiser_payment_orders").insert({ ...orderBase, gateway: "cashfree", cashfree_order_id: orderId });
    if (insertError) {
      console.error("fundraiser_payment_orders insert failed:", insertError.message);
      return { error: "Couldn't start the payment. Please try again." };
    }

    return {
      gateway: "cashfree",
      cashfreeSessionId: created.paymentSessionId,
      cashfreeMode: own.environment === "test" ? "sandbox" : "production",
      amount,
      fundraiserTitle: target.title,
      organizationName: target.organizationName,
    };
  }

  // 'own' mode — Razorpay, against the church's own account.
  const credentials = await getGivingCredentials(target.organizationId, target.paymentMode);
  if (!credentials) {
    return { error: "This giving link isn't set up correctly yet. Please try again later." };
  }

  let order;
  try {
    const client = createGivingRazorpayClient(credentials);
    order = await client.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `fr_${target.referenceId}_${Date.now()}`,
      notes: {
        kind: "fundraiser_giving",
        giving_type: target.givingType,
        fundraiser_id: target.fundraiserId ?? "",
        organization_id: target.organizationId,
        payment_mode: target.paymentMode,
      },
    });
  } catch (err) {
    console.error("giving order creation failed:", err);
    await logPlatformEvent({
      level: "error",
      source: "fundraiser_giving",
      message: "Razorpay giving order creation failed",
      organizationId: target.organizationId,
      metadata: { referenceId: target.referenceId, paymentMode: target.paymentMode },
    });
    return { error: "Couldn't start the payment. Please try again." };
  }

  const { error: insertError } = await admin.from("fundraiser_payment_orders").insert({ ...orderBase, gateway: "razorpay", razorpay_order_id: order.id });
  if (insertError) {
    console.error("fundraiser_payment_orders insert failed:", insertError.message);
    return { error: "Couldn't start the payment. Please try again." };
  }

  return {
    gateway: "razorpay",
    orderId: order.id,
    keyId: credentials.keyId,
    amount,
    fundraiserTitle: target.title,
    organizationName: target.organizationName,
  };
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
    .select("id, organization_id, title, payment_mode, payment_link_enabled, organizations(name, own_gateway)")
    .eq("share_token", shareToken)
    .maybeSingle();

  if (!fundraiser || !fundraiser.payment_link_enabled || !fundraiser.payment_mode) {
    return { error: "This giving link is no longer available." };
  }

  return startGivingPayment(
    {
      organizationId: fundraiser.organization_id,
      organizationName: (fundraiser.organizations as { name: string } | null)?.name ?? "",
      paymentMode: fundraiser.payment_mode as FundraiserPaymentMode,
      ownGateway: ((fundraiser.organizations as { own_gateway: Gateway } | null)?.own_gateway ?? "razorpay") as Gateway,
      fundraiserId: fundraiser.id,
      givingType: "fundraiser",
      title: fundraiser.title,
      returnPath: `/api/payu/giving/return?token=${shareToken}`,
      referenceId: fundraiser.id,
    },
    Number(amountRaw),
    donorNameRaw.trim(),
    donorEmail,
    donorPhone,
  );
}

// Church-wide giving (offering / tithe / donation) from /give/church/[token],
// on whichever gateway the church chose. Same re-validation as above.
export async function createChurchGivingOrder(
  orgToken: string,
  givingTypeRaw: string,
  amountRaw: string,
  donorNameRaw: string,
  donorEmail: string,
  donorPhone: string,
): Promise<CreateGivingOrderState> {
  if (!isGivingType(givingTypeRaw)) return { error: "Choose what you'd like to give." };
  const amountError = validateGivingAmount(amountRaw);
  if (amountError) return { error: amountError };
  const donorNameError = validateDonorName(donorNameRaw);
  if (donorNameError) return { error: donorNameError };

  const admin = createAdminClient();
  const { data: organization } = await admin
    .from("organizations")
    .select("id, name, giving_enabled, giving_mode, giving_types, own_gateway")
    .eq("giving_share_token", orgToken)
    .maybeSingle();

  if (!organization || !organization.giving_enabled || !organization.giving_mode) {
    return { error: "Online giving isn't available right now." };
  }
  if (!organization.giving_types.includes(givingTypeRaw)) {
    return { error: `${GIVING_TYPE_LABELS[givingTypeRaw]} isn't accepted online by this church.` };
  }

  return startGivingPayment(
    {
      organizationId: organization.id,
      organizationName: organization.name,
      paymentMode: organization.giving_mode as FundraiserPaymentMode,
      ownGateway: organization.own_gateway as Gateway,
      fundraiserId: null,
      givingType: givingTypeRaw,
      title: GIVING_TYPE_LABELS[givingTypeRaw],
      returnPath: `/api/payu/giving/return?token=${orgToken}&scope=church&type=${givingTypeRaw}`,
      referenceId: organization.id,
    },
    Number(amountRaw),
    donorNameRaw.trim(),
    donorEmail,
    donorPhone,
  );
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
