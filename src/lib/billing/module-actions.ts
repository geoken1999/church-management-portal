"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayClient } from "@/lib/billing/razorpay";
import { createSubscriptionCheckout } from "@/lib/billing/razorpay-subscription";
import { saveBillingDetails } from "@/lib/billing/billing-details-dal";
import { cancelMode, dateLabel } from "@/lib/billing/cancellation";
import { finishModuleSubscription, getModuleOffer, moduleLabel, moduleSummaryLabel } from "@/lib/billing/modules";
import { sendBillingEmail } from "@/lib/billing/receipts";
import { isPlanId, resolveTabStates, tabsOfModule, type CustomPlanOverrides } from "@/lib/plans/config";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { BillingDetailsErrors, BillingDetailsInput } from "@/lib/billing/billing-details";
import type { RazorpaySubscriptionCheckout } from "@/lib/razorpay/checkout";

const BILLING_PATH = "/dashboard/billing";

export interface ModuleCheckoutState {
  error?: string;
  billingErrors?: BillingDetailsErrors;
  checkout?: RazorpaySubscriptionCheckout;
}

// A church unlocking one module its plan leaves out. The price comes from Super Admin → Modules & pricing on the
// server, never from the browser. An abandoned checkout is replaced by the next try.
export async function startModuleCheckout(moduleKey: string, billing: BillingDetailsInput): Promise<ModuleCheckoutState> {
  const user = await requireUser();
  const [profile, membership] = await Promise.all([getProfile(), requireOrganization()]);
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only owners and admins can manage billing." };

  const offer = await getModuleOffer(moduleKey);
  if (!offer) return { error: "That module isn't available to add right now." };

  const organization = membership.organization;
  const planId = organization.plan && isPlanId(organization.plan) ? organization.plan : "basic";
  const tabs = resolveTabStates(planId, (organization.custom_plan_limits ?? null) as CustomPlanOverrides | null, organization.addon_modules);
  if (tabsOfModule(moduleKey).every((tab) => tabs[tab])) return { error: "That module is already part of your church's plan." };

  const saved = await saveBillingDetails(organization.id, billing);
  if ("errors" in saved) return { error: "Check your billing details.", billingErrors: saved.errors };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("organization_module_subscriptions").select("status").eq("organization_id", organization.id).eq("module_key", moduleKey).maybeSingle();
  if (existing && ["authenticated", "active", "pending", "halted"].includes(existing.status))
    return { error: "You've already subscribed to this module." };

  let created;
  try {
    created = await createSubscriptionCheckout({
      organizationId: organization.id,
      planLabel: `KingdomFlow ${moduleSummaryLabel(moduleKey)} module`,
      interval: "monthly",
      totalRupees: offer.total,
      prefill: {
        name: profile?.first_name ?? organization.name,
        email: profile?.email ?? user.email ?? undefined,
        contact: profile?.phone ?? undefined,
      },
      callbackUrl: `${getSiteUrl()}/api/razorpay/module/return?organizationId=${organization.id}&moduleKey=${encodeURIComponent(moduleKey)}`,
      notes: { kind: "module", module_key: moduleKey },
    });
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "subscription_billing",
      message: `Razorpay module subscription creation failed (${moduleKey}): ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: organization.id,
    });
    return { error: "Couldn't start checkout. Please try again." };
  }

  const { error } = await admin.from("organization_module_subscriptions").upsert(
    {
      organization_id: organization.id,
      module_key: moduleKey,
      status: "created",
      razorpay_subscription_id: created.subscriptionId,
      monthly_amount: offer.price,
      short_url: created.shortUrl,
      current_start: null,
      current_end: null,
      next_charge_at: null,
      cancel_at_period_end: false,
      cancel_requested_at: null,
    },
    { onConflict: "organization_id,module_key" },
  );
  if (error) {
    console.error("organization_module_subscriptions upsert failed:", error.message);
    return { error: "Couldn't start checkout. Please try again." };
  }
  revalidatePath(BILLING_PATH);
  return { checkout: created.checkout };
}

export interface ModuleActionState {
  error?: string;
  success?: boolean;
  endsAt?: string;
}

async function requireManager() {
  await requireUser();
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only owners and admins can manage billing." } as const;
  return { membership } as const;
}

// Like cancelling a plan: a live module is cancelled at the end of the period it has paid for, so the church keeps
// it until then and is not charged again.
export async function cancelModuleSubscription(moduleKey: string): Promise<ModuleActionState> {
  const auth = await requireManager();
  if ("error" in auth) return { error: auth.error };
  const organizationId = auth.membership.organization.id;
  const admin = createAdminClient();
  const { data: row } = await admin.from("organization_module_subscriptions").select("*").eq("organization_id", organizationId).eq("module_key", moduleKey).maybeSingle();
  if (!row || ["cancelled", "completed", "expired"].includes(row.status)) return { error: "There's no subscription to cancel." };
  if (row.cancel_at_period_end) return { success: true, endsAt: row.next_charge_at ?? undefined };

  const atPeriodEnd = cancelMode(row.status, row.next_charge_at, new Date()) === "at_period_end" && row.next_charge_at;
  if (row.razorpay_subscription_id && row.status !== "created") {
    try {
      await createRazorpayClient().subscriptions.cancel(row.razorpay_subscription_id, Boolean(atPeriodEnd));
    } catch (err) {
      await logPlatformEvent({
        level: "error",
        source: "subscription_billing",
        message: `Razorpay module cancel failed (${moduleKey}): ${err instanceof Error ? err.message : "unknown error"}`,
        organizationId,
      });
      return { error: "Couldn't cancel the subscription. Please try again." };
    }
  }

  if (atPeriodEnd && row.next_charge_at) {
    const { error } = await admin.from("organization_module_subscriptions").update({ cancel_at_period_end: true, cancel_requested_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return { error: "Couldn't cancel the subscription. Please try again." };
    await sendBillingEmail(
      organizationId,
      `${moduleSummaryLabel(moduleKey)} will end on ${dateLabel(row.next_charge_at)}`,
      `<p>You cancelled <strong>${moduleLabel(moduleKey)}</strong>. You keep it until <strong>${dateLabel(row.next_charge_at)}</strong>, the end of the period you've paid for, and you won't be charged again.</p>`,
    );
    revalidatePath(BILLING_PATH);
    return { success: true, endsAt: row.next_charge_at };
  }

  await finishModuleSubscription(row);
  revalidatePath(BILLING_PATH);
  return { success: true };
}

// Takes back a cancellation that is still waiting for the end of the period.
export async function keepModuleSubscription(moduleKey: string): Promise<ModuleActionState> {
  const auth = await requireManager();
  if ("error" in auth) return { error: auth.error };
  const organizationId = auth.membership.organization.id;
  const admin = createAdminClient();
  const { data: row } = await admin.from("organization_module_subscriptions").select("*").eq("organization_id", organizationId).eq("module_key", moduleKey).maybeSingle();
  if (!row?.cancel_at_period_end || row.status !== "active" || !row.next_charge_at || new Date(row.next_charge_at) <= new Date())
    return { error: "This subscription can't be resumed. Unlock the module again to subscribe." };
  if (row.razorpay_subscription_id) {
    try {
      await createRazorpayClient().subscriptions.cancelScheduledChanges(row.razorpay_subscription_id);
    } catch {
      return { error: "This cancellation can't be taken back. The module stays until the period ends; unlock it again after that." };
    }
  }
  const { error } = await admin.from("organization_module_subscriptions").update({ cancel_at_period_end: false, cancel_requested_at: null }).eq("id", row.id);
  if (error) return { error: "Couldn't resume the subscription. Please try again." };
  revalidatePath(BILLING_PATH);
  return { success: true };
}
