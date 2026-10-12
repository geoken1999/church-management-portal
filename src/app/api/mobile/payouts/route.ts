import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileAdmin, requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import { requireFinancePlan } from "@/lib/finance/actions";
import { PAYOUT_STREAMS, getOrganizationPayoutLedger, type PayoutStream } from "@/lib/payouts/ledger";
import { requestAllPayoutsCore } from "@/lib/payouts/request";
import { validatePayoutDetails } from "@/lib/organizations/payout-details";
import type { PayoutMethod } from "@/types/database";

// The staff mobile app's Payouts: the balances KingdomFlow owes the church from
// fundraisers, paid events and membership fees, a request for them, and where to
// send the money. Streams follow each module's tab permissions; the payout
// details (bank / UPI) are owner and admin only, as the web restricts saving them.
async function allowedStreams(request: Request, organizationId: string, level: "read" | "write") {
  const streams: PayoutStream[] = [];
  for (const stream of PAYOUT_STREAMS) {
    const access = await requireMobileTabAccess(request, organizationId, stream.tab, level);
    if (!(access instanceof NextResponse)) streams.push(stream.key);
  }
  return streams;
}

export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
  const probe = await requireMobileTabAccess(request, organizationId, "donations", "read").catch(() => null);
  const streams = await allowedStreams(request, organizationId, "read");
  if (streams.length === 0) return probe instanceof NextResponse ? probe : NextResponse.json({ ok: false, error: "You don't have access to payouts." }, { status: 403 });
  const planError = await requireFinancePlan(organizationId);
  if (planError) return NextResponse.json({ ok: false, error: planError });

  const writable = await allowedStreams(request, organizationId, "write");
  const ledger = await getOrganizationPayoutLedger(organizationId, streams);

  // Bank or UPI details only for an owner or admin.
  const admin = await requireMobileAdmin(request, organizationId);
  let details = null;
  if (!(admin instanceof NextResponse)) {
    const { data } = await createAdminClient()
      .from("organization_payout_details")
      .select("payout_method, upi_id, bank_account_holder, bank_account_number, bank_ifsc, bank_name")
      .eq("organization_id", organizationId)
      .maybeSingle();
    details = data;
  }
  return NextResponse.json({ ok: true, ledger, canRequest: writable.length > 0, canEditDetails: !(admin instanceof NextResponse), details });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");
  const organizationId = text("organizationId");

  if (body.action === "save_details") {
    const auth = await requireMobileAdmin(request, organizationId);
    if (auth instanceof NextResponse) return auth;
    const input = { payoutMethod: text("payoutMethod"), upiId: text("upiId"), bankAccountHolder: text("bankAccountHolder"), bankAccountNumber: text("bankAccountNumber"), bankIfsc: text("bankIfsc"), bankName: text("bankName") };
    const errors = validatePayoutDetails(input);
    const firstError = Object.values(errors).find(Boolean);
    if (firstError) return NextResponse.json({ ok: false, error: firstError });
    const { error } = await createAdminClient().from("organization_payout_details").upsert(
      {
        organization_id: organizationId,
        payout_method: input.payoutMethod as PayoutMethod,
        upi_id: input.payoutMethod === "upi" ? input.upiId : null,
        bank_account_holder: input.payoutMethod === "bank_transfer" ? input.bankAccountHolder : null,
        bank_account_number: input.payoutMethod === "bank_transfer" ? input.bankAccountNumber : null,
        bank_ifsc: input.payoutMethod === "bank_transfer" ? input.bankIfsc : null,
        bank_name: input.payoutMethod === "bank_transfer" ? input.bankName : null,
        updated_by: auth.userId,
      },
      { onConflict: "organization_id" },
    );
    return NextResponse.json(error ? { ok: false, error: "Couldn't save your payout details. Please try again." } : { ok: true });
  }

  if (body.action === "request_all") {
    const writable = await allowedStreams(request, organizationId, "write");
    if (writable.length === 0) return NextResponse.json({ ok: false, error: "You don't have permission to request payouts." });
    const planError = await requireFinancePlan(organizationId);
    if (planError) return NextResponse.json({ ok: false, error: planError });
    // The user id comes from any one successful tab check.
    const auth = await requireMobileTabAccess(request, organizationId, PAYOUT_STREAMS.find((s) => s.key === writable[0])!.tab, "write");
    if (auth instanceof NextResponse) return auth;
    const result = await requestAllPayoutsCore(organizationId, auth.userId, writable);
    return NextResponse.json(result.error ? { ok: false, error: result.error } : { ok: true, created: result.created, skipped: result.skipped });
  }

  return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
}
