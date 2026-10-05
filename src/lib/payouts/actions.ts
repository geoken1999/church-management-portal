"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { getOrganizationPayoutDetails } from "@/lib/organizations/payout-details-dal";
import { requireFinancePlan } from "@/lib/finance/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYOUT_STREAMS, getOrganizationPayoutLedger } from "@/lib/payouts/ledger";
import type { PayoutMethod } from "@/types/database";

const PAYOUTS_PATH = "/dashboard/payouts";

export interface RequestAllPayoutsState {
  error?: string;
  success?: boolean;
  created?: number;
  skipped?: string[];
}

// Requests every balance that is owed, one request per Fund Raiser, event and
// membership stream. Each request records the amount and the payout details at
// the time, so editing the saved details later doesn't change a request that's
// already been made. A stream with a request already pending is skipped, and
// the reason is returned.
export async function requestAllPayouts(): Promise<RequestAllPayoutsState> {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const planError = await requireFinancePlan(organizationId);
  if (planError) return { error: planError };

  const writable = PAYOUT_STREAMS.filter((s) => membership.tabAccess[s.tab].write).map((s) => s.key);
  if (writable.length === 0) {
    return { error: "You don't have permission to request payouts." };
  }
  const details = await getOrganizationPayoutDetails(organizationId);
  if (!details) {
    return { error: "Save your payout details below before requesting a payout." };
  }

  const isUpi = details.payoutMethod === "upi";
  const snapshot = {
    organization_id: organizationId,
    requested_by: user.id,
    payout_method: details.payoutMethod as PayoutMethod,
    upi_id: isUpi ? details.upiId : null,
    bank_account_holder: isUpi ? null : details.bankAccountHolder,
    bank_account_number: isUpi ? null : details.bankAccountNumber,
    bank_ifsc: isUpi ? null : details.bankIfsc,
    bank_name: isUpi ? null : details.bankName,
  };

  const ledger = await getOrganizationPayoutLedger(organizationId, writable);
  const admin = createAdminClient();
  let created = 0;
  const skipped: string[] = [];

  for (const balance of ledger.balances) {
    if (balance.owed <= 0) continue;
    if (balance.pendingRequestId) {
      skipped.push(`${balance.source}: a request is already pending`);
      continue;
    }
    const amount = Math.round(balance.owed * 100) / 100;

    let error: { message: string } | null = null;
    if (balance.stream === "fundraisers") {
      ({ error } = await admin.from("fundraiser_payout_requests").insert({ ...snapshot, amount, fundraiser_id: balance.sourceId! }));
    } else if (balance.stream === "events") {
      ({ error } = await admin.from("event_payout_requests").insert({ ...snapshot, amount, event_id: balance.sourceId! }));
    } else {
      ({ error } = await admin.from("membership_payout_requests").insert({ ...snapshot, amount }));
    }

    if (error) skipped.push(`${balance.source}: couldn't submit the request`);
    else created++;
  }

  if (created === 0 && skipped.length === 0) {
    return { error: "There's nothing owed to request a payout for." };
  }

  revalidatePath(PAYOUTS_PATH);
  return { success: true, created, skipped };
}
