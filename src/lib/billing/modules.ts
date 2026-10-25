import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayClient } from "@/lib/billing/razorpay";
import { issueAndEmailInvoice } from "@/lib/invoices/issue";
import { sendBillingEmail } from "@/lib/billing/receipts";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { withGst, formatRupees } from "@/lib/billing/gst";
import { ONBOARDING_MODULES } from "@/lib/onboarding/config";
import { getModulePricing } from "@/lib/onboarding/store";
import { tabsOfModule } from "@/lib/plans/config";
import type { ModuleSubscriptionStatus, OrganizationModuleSubscription } from "@/types/database";

// A church buying a module its plan leaves out, on its own monthly Razorpay subscription. The price is the module's
// price in Super Admin → Modules & pricing (per month before GST), copied onto the subscription when it is taken.

export const MODULE_SUBSCRIPTION_STATUSES_IN_PROGRESS = ["created", "authenticated", "active", "pending", "halted"] as const;

export function moduleLabel(moduleKey: string): string {
  return ONBOARDING_MODULES.find((m) => m.key === moduleKey)?.label ?? moduleKey;
}

export function moduleSummaryLabel(moduleKey: string): string {
  // "Finance (Fundraisers, Offerings, ...)" reads long in a button; the first word is enough there.
  return moduleLabel(moduleKey).replace(/\s*\(.*\)\s*$/, "");
}

export interface ModuleOffer {
  moduleKey: string;
  label: string;
  tabs: string[];
  /** Per month, before GST. */
  price: number;
  /** Per month, with 18% GST: what is charged. */
  total: number;
}

/** What a module costs, or null when it isn't for sale (unknown module, or no price set). */
export async function getModuleOffer(moduleKey: string): Promise<ModuleOffer | null> {
  const entry = ONBOARDING_MODULES.find((m) => m.key === moduleKey);
  if (!entry) return null;
  const price = (await getModulePricing())[moduleKey]?.monthly_price ?? 0;
  if (!(price > 0)) return null;
  return { moduleKey, label: entry.label, tabs: tabsOfModule(moduleKey), price, total: withGst(price).total };
}

/** The module keys that have a price, so the menu knows which locked modules can be unlocked. */
export async function purchasableModuleKeys(): Promise<Set<string>> {
  const pricing = await getModulePricing();
  return new Set(ONBOARDING_MODULES.filter((m) => (pricing[m.key]?.monthly_price ?? 0) > 0).map((m) => m.key));
}

export async function getModuleSubscriptions(organizationId: string): Promise<OrganizationModuleSubscription[]> {
  const { data } = await createAdminClient().from("organization_module_subscriptions").select("*").eq("organization_id", organizationId).order("created_at");
  return (data ?? []) as OrganizationModuleSubscription[];
}

const toIso = (unixSeconds: number | null | undefined): string | null => (unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null);

export interface ModuleSubscriptionEntity {
  id: string;
  status?: string;
  customer_id?: string | null;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
}

/**
 * The church authorised the module's subscription: switch it on. Safe to call twice (the return route and the
 * webhook both do): only the first call that finds it not yet live does the work.
 */
export async function activateModuleSubscription(subscriptionId: string, entity?: ModuleSubscriptionEntity): Promise<{ error?: string; success?: boolean }> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("organization_module_subscriptions").select("id, organization_id, module_key, status").eq("razorpay_subscription_id", subscriptionId).maybeSingle();
  if (!row) return { error: "That subscription could not be found." };
  if (row.status === "active") return { success: true };

  const live = entity ?? ((await createRazorpayClient().subscriptions.fetch(subscriptionId)) as unknown as ModuleSubscriptionEntity);
  const { data: claimed } = await admin
    .from("organization_module_subscriptions")
    .update({
      status: "active",
      razorpay_customer_id: live.customer_id ?? undefined,
      current_start: toIso(live.current_start) ?? new Date().toISOString(),
      current_end: toIso(live.current_end),
      next_charge_at: toIso(live.charge_at),
    })
    .eq("id", row.id)
    .in("status", ["created", "authenticated", "pending", "halted"])
    .select("id")
    .maybeSingle();
  if (!claimed) return { success: true };

  await sendBillingEmail(
    row.organization_id,
    `${moduleSummaryLabel(row.module_key)} is now on`,
    `<p>Thanks! <strong>${moduleLabel(row.module_key)}</strong> is now unlocked for your church, billed monthly on its own subscription. You can see or cancel it anytime from the Billing page.</p>`,
  );
  return { success: true };
}

/**
 * One successful monthly charge of a module (webhook subscription.charged): the payment record and the tax invoice
 * emailed to the church (with our copy). Keyed on the payment id, so a redelivered webhook changes nothing.
 */
export async function recordModuleCharge(input: {
  organizationId: string;
  moduleKey: string;
  monthlyAmount: number;
  razorpaySubscriptionId: string;
  paymentId: string;
  amountPaise: number;
  paidAt: string;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from("platform_subscription_payments").upsert(
    {
      organization_id: input.organizationId,
      razorpay_subscription_id: input.razorpaySubscriptionId,
      razorpay_payment_id: input.paymentId,
      plan_id: `module:${input.moduleKey}`,
      amount: input.amountPaise / 100,
      currency: "INR",
      paid_at: input.paidAt,
    },
    { onConflict: "razorpay_payment_id", ignoreDuplicates: true },
  );
  await issueAndEmailInvoice({
    organizationId: input.organizationId,
    kind: "subscription",
    reference: input.paymentId,
    description: `${moduleSummaryLabel(input.moduleKey)} module subscription (monthly)`,
    baseAmount: input.monthlyAmount,
  });
}

/** The module's subscription ended (cancelled at the close of its period, completed or expired): access goes. */
export async function finishModuleSubscription(row: { id: string; organization_id: string; module_key: string }, status: "cancelled" | "completed" | "expired" = "cancelled"): Promise<void> {
  await createAdminClient().from("organization_module_subscriptions").update({ status, next_charge_at: null, cancel_at_period_end: false }).eq("id", row.id);
  await sendBillingEmail(
    row.organization_id,
    `${moduleSummaryLabel(row.module_key)} has ended`,
    `<p><strong>${moduleLabel(row.module_key)}</strong> is no longer part of your church's subscription, and its menu item is locked again. You can unlock it any time from the menu.</p>`,
  );
  await logPlatformEvent({ level: "info", source: "subscription_billing", message: `Module ${row.module_key} ended`, organizationId: row.organization_id, metadata: { subscriptionRow: row.id } });
}

export const moduleChargeText = (monthlyAmount: number) => `${formatRupees(withGst(monthlyAmount).total)} a month incl. GST`;

/**
 * A Razorpay event for a module's subscription (the webhook calls this when the subscription id belongs to a module
 * and not to the church's plan). Throws on a failure so the webhook answers 500 and Razorpay sends it again.
 */
export async function handleModuleSubscriptionEvent(input: {
  event: string;
  entity: ModuleSubscriptionEntity;
  payment?: { id?: string; amount?: number; created_at?: number } | null;
  row: { id: string; organization_id: string; module_key: string; status: string; monthly_amount: number | string };
}): Promise<void> {
  const { event, entity, payment, row } = input;
  const admin = createAdminClient();

  if (event === "subscription.activated" || event === "subscription.charged") await activateModuleSubscription(entity.id, entity);

  const endedStatus = event === "subscription.cancelled" ? "cancelled" : event === "subscription.completed" ? "completed" : event === "subscription.expired" ? "expired" : null;
  if (endedStatus) {
    if (!["cancelled", "completed", "expired"].includes(row.status)) await finishModuleSubscription(row, endedStatus);
    return;
  }

  if (!(event === "subscription.authenticated" && row.status === "active")) {
    // Keeps our copy of Razorpay's state current: status, customer, the period and the next charge date.
    const reported = (entity.status ?? row.status) as ModuleSubscriptionStatus;
    const status: ModuleSubscriptionStatus = event === "subscription.halted" ? "halted" : event === "subscription.pending" ? "pending" : reported;
    await admin
      .from("organization_module_subscriptions")
      .update({
        status,
        razorpay_customer_id: entity.customer_id ?? undefined,
        current_start: toIso(entity.current_start),
        current_end: toIso(entity.current_end),
        next_charge_at: toIso(entity.charge_at),
      })
      .eq("id", row.id);
  }

  if (event === "subscription.charged" && payment?.id && (payment.amount ?? 0) > 0) {
    await recordModuleCharge({
      organizationId: row.organization_id,
      moduleKey: row.module_key,
      monthlyAmount: Number(row.monthly_amount),
      razorpaySubscriptionId: entity.id,
      paymentId: payment.id,
      amountPaise: payment.amount ?? 0,
      paidAt: toIso(payment.created_at) ?? new Date().toISOString(),
    });
  }

  if (event === "subscription.halted" || event === "subscription.pending") {
    await sendBillingEmail(
      row.organization_id,
      event === "subscription.halted" ? `${moduleSummaryLabel(row.module_key)} is locked: payment failed` : `Payment for ${moduleSummaryLabel(row.module_key)} didn't go through`,
      event === "subscription.halted"
        ? `<p>We couldn't collect the monthly payment for <strong>${moduleLabel(row.module_key)}</strong> after several tries, so it is locked again. Unlock it from the menu to start a new subscription.</p>`
        : `<p>The monthly payment for <strong>${moduleLabel(row.module_key)}</strong> didn't go through. We'll try again automatically; please make sure your payment method has funds so the module stays on.</p>`,
    );
  }
}
