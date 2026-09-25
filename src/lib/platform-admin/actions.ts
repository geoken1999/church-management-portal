"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { isPlanId } from "@/lib/plans/config";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { SupportTicketStatus } from "@/types/database";

const PAYOUTS_PATH = "/platform-admin/payouts";
const TENANTS_PATH = "/platform-admin/tenants";
const SUPPORT_PATH = "/platform-admin/support";

const SUPPORT_TICKET_STATUSES: SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];

export interface RecordPayoutState {
  error?: string;
  success?: boolean;
}

// Purely a bookkeeping entry — recording a payout here does not itself
// move any money. It's how a platform operator marks that they've
// already wired funds to the church externally for a 'shared'-mode
// fundraiser.
export async function recordFundraiserPayout(_prevState: RecordPayoutState, formData: FormData): Promise<RecordPayoutState> {
  const user = await requirePlatformAdmin();

  const fundraiserId = String(formData.get("fundraiserId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const amount = Number(amountRaw);
  if (!amountRaw.trim() || Number.isNaN(amount) || amount <= 0) {
    return { error: "Enter an amount greater than 0." };
  }

  const admin = createAdminClient();
  const { data: payout, error } = await admin
    .from("fundraiser_payouts")
    .insert({
      organization_id: organizationId,
      fundraiser_id: fundraiserId,
      amount,
      note: note || null,
      paid_by: user.id,
    })
    .select("id")
    .single();

  if (error || !payout) {
    return { error: "Couldn't record that payout. Please try again." };
  }

  // Resolves whichever pending request this payout was for, if any — a
  // payout can also be recorded ad hoc with no request behind it, which
  // is left alone here.
  await admin
    .from("fundraiser_payout_requests")
    .update({ status: "paid", resolved_payout_id: payout.id })
    .eq("fundraiser_id", fundraiserId)
    .eq("status", "pending");

  revalidatePath(PAYOUTS_PATH);
  return { success: true };
}

export interface SetTenantPlanState {
  error?: string;
  success?: boolean;
}

// Grants a plan for free ("comping" it) — upserts an organization_subscriptions
// row with status 'active' and no razorpay_subscription_id, same shape
// getPlanAccess already reads to decide effective access, so the org
// immediately gets that plan's limits without ever going through Razorpay.
export async function setTenantPlan(_prevState: SetTenantPlanState, formData: FormData): Promise<SetTenantPlanState> {
  const platformAdmin = await requirePlatformAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");
  const planId = String(formData.get("planId") ?? "");

  if (!isPlanId(planId)) {
    return { error: "Select a valid plan." };
  }

  const admin = createAdminClient();
  const { error: subError } = await admin
    .from("organization_subscriptions")
    .upsert({ organization_id: organizationId, plan_id: planId, status: "active" }, { onConflict: "organization_id" });

  if (subError) {
    return { error: "Couldn't update that tenant's plan. Please try again." };
  }

  await admin.from("organizations").update({ plan: planId }).eq("id", organizationId);

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) set tenant plan to ${planId}`,
    organizationId,
    metadata: { planId },
  });

  revalidatePath(TENANTS_PATH);
  return { success: true };
}

export interface ExtendTenantTrialState {
  error?: string;
  success?: boolean;
}

export async function extendTenantTrial(_prevState: ExtendTenantTrialState, formData: FormData): Promise<ExtendTenantTrialState> {
  const platformAdmin = await requirePlatformAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");
  const daysRaw = String(formData.get("days") ?? "");
  const days = Number(daysRaw);

  if (!daysRaw.trim() || Number.isNaN(days) || days <= 0) {
    return { error: "Enter a number of days greater than 0." };
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("trial_ends_at").eq("id", organizationId).maybeSingle();
  if (!org) {
    return { error: "That tenant could not be found." };
  }

  // Extends from whichever is later — "now" or the existing trial_ends_at
  // — so this always adds `days` of runway rather than shrinking a trial
  // that already runs further out than today.
  const base = org.trial_ends_at && new Date(org.trial_ends_at) > new Date() ? new Date(org.trial_ends_at) : new Date();
  const newTrialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  const { error } = await admin.from("organizations").update({ trial_ends_at: newTrialEndsAt.toISOString() }).eq("id", organizationId);
  if (error) {
    return { error: "Couldn't extend that trial. Please try again." };
  }

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) extended trial by ${days} days`,
    organizationId,
    metadata: { days, newTrialEndsAt: newTrialEndsAt.toISOString() },
  });

  revalidatePath(TENANTS_PATH);
  return { success: true };
}

export async function updateSupportTicketStatus(formData: FormData) {
  const platformAdmin = await requirePlatformAdmin();
  const ticketId = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!SUPPORT_TICKET_STATUSES.includes(status as SupportTicketStatus)) return;

  const admin = createAdminClient();
  await admin.from("support_tickets").update({ status: status as SupportTicketStatus }).eq("id", ticketId);

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) set support ticket status to ${status}`,
    metadata: { ticketId, status },
  });

  revalidatePath(SUPPORT_PATH);
}
