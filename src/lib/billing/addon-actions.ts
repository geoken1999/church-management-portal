"use server";

import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCheckout } from "@/lib/razorpay/platform";
import type { RazorpayCheckout } from "@/lib/razorpay/checkout";
import { getAddonPack } from "@/lib/plans/config";
import { getSiteUrl } from "@/lib/site-url";
import { sendAddonPurchaseEmail } from "@/lib/billing/receipts";
import { withGst } from "@/lib/billing/gst";
import { saveBillingDetails } from "@/lib/billing/billing-details-dal";
import type {
  BillingDetailsErrors,
  BillingDetailsInput,
} from "@/lib/billing/billing-details";
import { issueAndEmailInvoice } from "@/lib/invoices/issue";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { AddonType } from "@/lib/plans/config";

export interface CreateAddonOrderState {
  error?: string;
  billingErrors?: BillingDetailsErrors;
  checkout?: RazorpayCheckout;
  // What the buyer pays: the price, the GST on it, and the total.
  amount?: number;
  gst?: number;
  total?: number;
  packLabel?: string;
}

// Add-on packs are always sold by the platform (unlike Fund Raiser giving,
// there's no "own payment gateway account" mode here) — so this always uses
// the platform's own Razorpay account, the same one subscription billing uses.
//
// The attempt is recorded under this app's own reference (the txnid, kept in
// the payu_txnid column from when this ran on PayU) and a Razorpay order is
// created whose receipt is that reference, so the return handler can find the
// attempt again from the order Razorpay sends the browser back with.
export async function createAddonOrder(
  packId: string,
  billing: BillingDetailsInput,
): Promise<CreateAddonOrderState> {
  const user = await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only owners and admins can manage billing." };
  }

  const pack = getAddonPack(packId);
  if (!pack) {
    return { error: "Select a valid add-on pack." };
  }

  const organizationId = membership.organization.id;

  // The invoice is made out to these details, so they are checked and saved before any payment starts.
  const saved = await saveBillingDetails(organizationId, billing);
  if ("errors" in saved)
    return {
      error: "Check your billing details.",
      billingErrors: saved.errors,
    };
  const price = withGst(pack.priceInRupees);

  const txnid = `addon${Date.now()}${organizationId.replace(/-/g, "").slice(0, 8)}`;

  const admin = createAdminClient();
  const { error: insertError } = await admin
    .from("organization_addon_orders")
    .insert({
      organization_id: organizationId,
      addon_type: pack.addonType,
      pack_id: pack.id,
      credits: pack.credits,
      amount: pack.priceInRupees,
      gst_amount: price.gst,
      total_amount: price.total,
      payu_txnid: txnid,
    });

  if (insertError) {
    console.error(
      "organization_addon_orders insert failed:",
      insertError.message,
    );
    await logPlatformEvent({
      level: "error",
      source: "addon_purchase",
      message: `organization_addon_orders insert failed: ${insertError.message}`,
      organizationId,
      metadata: { packId: pack.id, txnid },
    });
    return { error: "Couldn't start the payment. Please try again." };
  }

  const profile = await getProfile();
  let checkout;
  try {
    checkout = await createCheckout({
      receipt: txnid,
      amountRupees: price.total,
      name: "KingdomFlow",
      description: `Add-on pack: ${pack.label}`,
      prefill: {
        name:
          [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
          undefined,
        email: user.email ?? undefined,
        contact: profile?.phone || undefined,
      },
      callbackUrl: `${getSiteUrl()}/api/razorpay/addon/return`,
      notes: { kind: "addon", organization_id: organizationId },
    });
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "addon_purchase",
      message: `Razorpay order creation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
      metadata: { packId: pack.id, txnid },
    });
    return { error: "Payments aren't configured yet. Please try again later." };
  }

  return {
    checkout,
    amount: price.base,
    gst: price.gst,
    total: price.total,
    packLabel: pack.label,
  };
}

export interface FinalizeAddonOrderResult {
  error?: string;
  success?: boolean;
}

// Called only from the Razorpay return route (/api/razorpay/addon/return) and
// the Razorpay webhook, after they have verified the payment — this function
// itself does no verification, it trusts its caller. `mihpayid` is the
// Razorpay payment id (the column name is from the PayU days). Same atomic-claim idempotency
// pattern as before: the status 'created' -> 'paid' UPDATE only matches
// once, so a redelivered or duplicate callback can't credit the balance
// twice for the same order.
export async function finalizeAddonOrderPayment(
  txnid: string,
  mihpayid: string,
): Promise<FinalizeAddonOrderResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("organization_addon_orders")
    .select("id, organization_id, addon_type, pack_id, credits, amount, status")
    .eq("payu_txnid", txnid)
    .maybeSingle();

  if (!order) {
    return { error: "That payment could not be found." };
  }

  if (order.status === "paid") {
    return { success: true };
  }

  const { data: claimed } = await admin
    .from("organization_addon_orders")
    .update({
      status: "paid",
      payu_mihpayid: mihpayid,
      paid_at: new Date().toISOString(),
    })
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
    .select(
      "addon_sms_credits, addon_email_credits, addon_whatsapp_credits, addon_storage_bytes, addon_ai_credits",
    )
    .eq("id", order.organization_id)
    .single();

  const addonType = order.addon_type as AddonType;
  const update =
    addonType === "sms"
      ? { addon_sms_credits: (org?.addon_sms_credits ?? 0) + order.credits }
      : addonType === "email"
        ? {
            addon_email_credits:
              (org?.addon_email_credits ?? 0) + order.credits,
          }
        : addonType === "whatsapp"
          ? {
              addon_whatsapp_credits:
                (org?.addon_whatsapp_credits ?? 0) + order.credits,
            }
          : addonType === "ai"
            ? { addon_ai_credits: (org?.addon_ai_credits ?? 0) + order.credits }
            : {
                addon_storage_bytes:
                  (org?.addon_storage_bytes ?? 0) + order.credits,
              };

  await admin
    .from("organizations")
    .update(update)
    .eq("id", order.organization_id);

  // The tax invoice for this payment, emailed to the billing email. It never holds up the credits.
  const packLabel = getAddonPack(order.pack_id)?.label ?? order.addon_type;
  const invoiceId = await issueAndEmailInvoice({
    organizationId: order.organization_id,
    kind: "addon",
    reference: txnid,
    description: `Add-on pack: ${packLabel}`,
    baseAmount: Number(order.amount),
  });
  if (invoiceId)
    await admin
      .from("organization_addon_orders")
      .update({ invoice_id: invoiceId })
      .eq("id", order.id);

  await sendAddonPurchaseEmail(order.organization_id, packLabel, order.amount);

  return { success: true };
}
