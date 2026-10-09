"use server";

import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPaymentRequestFields, type PayUFormFields } from "@/lib/payu/client";
import { getAddonPack } from "@/lib/plans/config";
import { getSiteUrl } from "@/lib/site-url";
import { sendAddonPurchaseEmail } from "@/lib/billing/receipts";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { AddonType } from "@/lib/plans/config";

export interface CreateAddonOrderState {
  error?: string;
  payuFields?: PayUFormFields;
  payuActionUrl?: string;
  amount?: number;
  packLabel?: string;
}

// Add-on packs are always sold by the platform (unlike Fund Raiser giving,
// there's no "own payment gateway account" mode here) — so this always uses
// the platform's own PayU account, the same one subscription billing uses.
//
// Unlike Razorpay, PayU has no server-side "create order" call — there's
// nothing to ask PayU for yet. This builds the hashed form fields the
// browser will POST straight to PayU's hosted checkout (a full-page
// redirect, not a popup), and records the attempt under this app's own
// transaction id so the return handler can find it again.
export async function createAddonOrder(packId: string): Promise<CreateAddonOrderState> {
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
  const txnid = `addon${Date.now()}${organizationId.replace(/-/g, "").slice(0, 8)}`;

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("organization_addon_orders").insert({
    organization_id: organizationId,
    addon_type: pack.addonType,
    pack_id: pack.id,
    credits: pack.credits,
    amount: pack.priceInRupees,
    payu_txnid: txnid,
  });

  if (insertError) {
    console.error("organization_addon_orders insert failed:", insertError.message);
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
  const siteUrl = getSiteUrl();
  let built;
  try {
    built = buildPaymentRequestFields({
      txnid,
      amountRupees: pack.priceInRupees,
      productinfo: `Add-on pack: ${pack.label}`,
      firstname: profile?.first_name || "Admin",
      email: user.email ?? "billing@kingdomflow.in",
      phone: profile?.phone || "9999999999",
      surl: `${siteUrl}/api/payu/addon/return`,
      furl: `${siteUrl}/api/payu/addon/return`,
      udf1: `addon:${txnid}`,
    });
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "addon_purchase",
      message: `PayU field build failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
      metadata: { packId: pack.id, txnid },
    });
    return { error: "Payments aren't configured yet. Please try again later." };
  }

  return { payuFields: built.fields, payuActionUrl: built.actionUrl, amount: pack.priceInRupees, packLabel: pack.label };
}

export interface FinalizeAddonOrderResult {
  error?: string;
  success?: boolean;
}

// Called only from the PayU return route (/api/payu/addon/return), after
// that route has verified PayU's hash — this function itself does no
// verification, it trusts its caller. Same atomic-claim idempotency
// pattern as before: the status 'created' -> 'paid' UPDATE only matches
// once, so a redelivered or duplicate callback can't credit the balance
// twice for the same order.
export async function finalizeAddonOrderPayment(txnid: string, mihpayid: string): Promise<FinalizeAddonOrderResult> {
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
    .update({ status: "paid", payu_mihpayid: mihpayid, paid_at: new Date().toISOString() })
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
    .select("addon_sms_credits, addon_email_credits, addon_whatsapp_credits, addon_storage_bytes, addon_ai_credits")
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
          : addonType === "ai"
            ? { addon_ai_credits: (org?.addon_ai_credits ?? 0) + order.credits }
            : { addon_storage_bytes: (org?.addon_storage_bytes ?? 0) + order.credits };

  await admin.from("organizations").update(update).eq("id", order.organization_id);

  await sendAddonPurchaseEmail(order.organization_id, getAddonPack(order.pack_id)?.label ?? order.addon_type, order.amount);

  return { success: true };
}
