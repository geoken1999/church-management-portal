import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizationPayoutLedger, type PayoutStream } from "@/lib/payouts/ledger";
import type { PayoutMethod } from "@/types/database";

export interface RequestAllPayoutsResult {
  error?: string;
  success?: boolean;
  created?: number;
  skipped?: string[];
}

// Requests every balance that is owed, one request per Fund Raiser, event and
// membership stream. Each request records the amount and the payout details at
// the time, so editing the saved details later doesn't change a request that's
// already been made. A stream with a request already pending is skipped, and
// the reason is returned. Shared by the web Payouts page and the staff mobile
// app; the caller has already checked the person may write each stream in
// [writable] and that the church has the Finance plan.
export async function requestAllPayoutsCore(organizationId: string, userId: string, writable: PayoutStream[]): Promise<RequestAllPayoutsResult> {
  if (writable.length === 0) return { error: "You don't have permission to request payouts." };

  const admin = createAdminClient();
  const { data: details } = await admin
    .from("organization_payout_details")
    .select("payout_method, upi_id, bank_account_holder, bank_account_number, bank_ifsc, bank_name")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!details) return { error: "Save your payout details below before requesting a payout." };

  const isUpi = details.payout_method === "upi";
  const snapshot = {
    organization_id: organizationId,
    requested_by: userId,
    payout_method: details.payout_method as PayoutMethod,
    upi_id: isUpi ? details.upi_id : null,
    bank_account_holder: isUpi ? null : details.bank_account_holder,
    bank_account_number: isUpi ? null : details.bank_account_number,
    bank_ifsc: isUpi ? null : details.bank_ifsc,
    bank_name: isUpi ? null : details.bank_name,
  };

  const ledger = await getOrganizationPayoutLedger(organizationId, writable);
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
    } else if (balance.stream === "courses") {
      ({ error } = await admin.from("course_payout_requests").insert({ ...snapshot, amount }));
    } else {
      ({ error } = await admin.from("membership_payout_requests").insert({ ...snapshot, amount }));
    }

    if (error) skipped.push(`${balance.source}: couldn't submit the request`);
    else created++;
  }

  if (created === 0 && skipped.length === 0) return { error: "There's nothing owed to request a payout for." };
  return { success: true, created, skipped };
}
