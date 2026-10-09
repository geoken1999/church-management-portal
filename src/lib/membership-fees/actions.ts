"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { getOrganizationPayoutDetails } from "@/lib/organizations/payout-details-dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { requireFinancePlan } from "@/lib/finance/actions";
import { sharedServiceNetAmount } from "@/lib/finance/fees";
import { buildPaymentRequestFields, type PayUFormFields } from "@/lib/payu/client";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { financeEnabledForBackground } from "@/lib/plans/dal";
import {
  membershipPeriodLabel,
  validateMembershipFeeSettings,
  type MembershipFeeSettingsErrors,
} from "@/lib/membership-fees/config";

const MEMBERSHIP_PATH = "/dashboard/membership-fees";
const TAB = "donations" as const;

// ---- Settings (church admins and staff with Donations write access) ----

export interface SaveMembershipFeeSettingsState {
  error?: string;
  success?: boolean;
  fieldErrors?: MembershipFeeSettingsErrors;
}

export async function saveMembershipFeeSettings(
  _prevState: SaveMembershipFeeSettingsState,
  formData: FormData,
): Promise<SaveMembershipFeeSettingsState> {
  const user = await requireUser();
  const organizationId = (await requireOrganization()).organization.id;

  const planError = await requireFinancePlan(organizationId);
  if (planError) return { error: planError };
  const access = await checkTabAccess(organizationId, TAB, "write");
  if (!access.ok) return { error: access.message };

  const enabled = formData.get("enabled") === "on";
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = amountRaw === "" ? null : Number(amountRaw);
  const dueDay = Number(formData.get("dueDay"));
  const reminderAfterDays = Number(formData.get("reminderAfterDays"));

  const fieldErrors = validateMembershipFeeSettings({ enabled, amount, dueDay, reminderAfterDays });
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const admin = createAdminClient();
  const { error } = await admin.from("membership_fee_settings").upsert(
    {
      organization_id: organizationId,
      enabled,
      amount,
      due_day: dueDay,
      reminder_after_days: reminderAfterDays,
      updated_by: user.id,
    },
    { onConflict: "organization_id" },
  );
  if (error) return { error: "Couldn't save those settings. Please try again." };

  revalidatePath(MEMBERSHIP_PATH);
  return { success: true };
}

// ---- Member payment (public link, no login; the token is the credential) ----
//
// Membership fees only ever use the platform's own shared PayU account —
// there's no "church's own gateway" option for this flow (that choice only
// exists for fundraiser giving), so this talks to @/lib/payu/client directly
// rather than going through the credentials lookup fundraiser giving needs.

export interface CreateMembershipOrderState {
  error?: string;
  alreadyPaid?: boolean;
  payuFields?: PayUFormFields;
  payuActionUrl?: string;
  amount?: number;
  organizationName?: string;
  periodLabel?: string;
}

// Called on every "Pay" click, including a retry after a failed/declined
// attempt — it reuses a still-'due' invoice's existing payu_txnid if one was
// already created, same idempotency reasoning migration 0115/0116 established
// for add-on packs and event registration.
export async function createMembershipInvoiceOrder(token: string): Promise<CreateMembershipOrderState> {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return { error: "This payment link isn't valid." };
  }

  const admin = createAdminClient();
  const { data: invoice } = await admin
    .from("membership_fee_invoices")
    .select("id, organization_id, member_id, amount, status, period, payu_txnid")
    .eq("public_token", token)
    .maybeSingle();

  if (!invoice) return { error: "This payment link isn't valid." };
  // membership_fee_invoices has no declared FK relationship to either table
  // (Relationships: [] in database.ts), so these are separate lookups rather
  // than an embedded select.
  const [{ data: org }, { data: member }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", invoice.organization_id).maybeSingle(),
    admin.from("members").select("first_name, email, phone").eq("id", invoice.member_id).maybeSingle(),
  ]);
  const organizationName = org?.name ?? "";
  const periodLabel = membershipPeriodLabel(invoice.period);

  if (invoice.status === "paid") return { alreadyPaid: true, organizationName, periodLabel };
  if (invoice.status !== "due") return { error: "This payment request is no longer open." };

  if (!(await financeEnabledForBackground(invoice.organization_id))) {
    return { error: "Online payment is temporarily unavailable. Please contact the church." };
  }

  const amount = Number(invoice.amount);

  let txnid = invoice.payu_txnid;
  if (!txnid) {
    txnid = `mship${Date.now()}${invoice.id.replace(/-/g, "").slice(0, 8)}`;
    const { data: stored } = await admin
      .from("membership_fee_invoices")
      .update({ payu_txnid: txnid })
      .eq("id", invoice.id)
      .is("payu_txnid", null)
      .select("payu_txnid")
      .maybeSingle();
    if (!stored) {
      // Lost a concurrent-click race — use whichever txnid actually got stored.
      const { data: current } = await admin.from("membership_fee_invoices").select("payu_txnid").eq("id", invoice.id).maybeSingle();
      txnid = current?.payu_txnid ?? txnid;
    }
  }

  const siteUrl = getSiteUrl();
  const returnUrl = `${siteUrl}/api/payu/membership/return?token=${token}`;

  let built;
  try {
    built = buildPaymentRequestFields({
      txnid,
      amountRupees: amount,
      productinfo: `Membership fee: ${periodLabel}`,
      firstname: member?.first_name ?? "Member",
      email: member?.email ?? `no-reply+${invoice.id}@kingdomflow.app`,
      phone: member?.phone ?? "9999999999",
      surl: returnUrl,
      furl: returnUrl,
      udf1: `mship:${invoice.id}`,
    });
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "membership_fee",
      message: `PayU field build failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: invoice.organization_id,
      metadata: { invoiceId: invoice.id, txnid },
    });
    return { error: "Couldn't start the payment. Please try again." };
  }

  return { payuFields: built.fields, payuActionUrl: built.actionUrl, amount, organizationName, periodLabel };
}

// ---- Church payout request (same rules as fundraiser payouts) ----

export interface RequestMembershipPayoutState {
  error?: string;
  success?: boolean;
}

// The amount owed is computed here, never taken from the form. It's what
// membership fees collected through the shared account, less the platform's
// fee, minus what has already been paid out. The payout details are the
// organization's saved profile, copied onto the request so later edits don't
// change where this payout goes.
// The form carries no fields, so the action takes no arguments. It still fits
// useActionState, which passes the previous state and form data that it ignores.
export async function requestMembershipPayout(): Promise<RequestMembershipPayoutState> {
  const user = await requireUser();
  const organizationId = (await requireOrganization()).organization.id;

  const planError = await requireFinancePlan(organizationId);
  if (planError) return { error: planError };
  const access = await checkTabAccess(organizationId, TAB, "write");
  if (!access.ok) return { error: access.message };

  const payoutDetails = await getOrganizationPayoutDetails(organizationId);
  if (!payoutDetails) {
    return { error: "Save your payout details (UPI or bank) in your organization settings before requesting a payout." };
  }

  const admin = createAdminClient();
  const [{ data: paidInvoices }, { data: payouts }, { data: pending }] = await Promise.all([
    admin.from("membership_fee_invoices").select("amount").eq("organization_id", organizationId).eq("status", "paid"),
    admin.from("membership_payouts").select("amount").eq("organization_id", organizationId),
    admin.from("membership_payout_requests").select("id").eq("organization_id", organizationId).eq("status", "pending").maybeSingle(),
  ]);

  if (pending) return { error: "A payout request is already pending for membership fees." };

  const collected = (paidInvoices ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const paidOut = (payouts ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const owed = Math.round((sharedServiceNetAmount(collected) - paidOut) * 100) / 100;
  if (owed <= 0) return { error: "There's nothing owed to request a payout for." };

  const isUpi = payoutDetails.payoutMethod === "upi";
  const { error } = await admin.from("membership_payout_requests").insert({
    organization_id: organizationId,
    amount: owed,
    requested_by: user.id,
    payout_method: payoutDetails.payoutMethod,
    upi_id: isUpi ? payoutDetails.upiId : null,
    bank_account_holder: isUpi ? null : payoutDetails.bankAccountHolder,
    bank_account_number: isUpi ? null : payoutDetails.bankAccountNumber,
    bank_ifsc: isUpi ? null : payoutDetails.bankIfsc,
    bank_name: isUpi ? null : payoutDetails.bankName,
  });
  if (error) return { error: "Couldn't submit that payout request. Please try again." };

  revalidatePath(MEMBERSHIP_PATH);
  return { success: true };
}
