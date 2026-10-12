import { NextResponse } from "next/server";
import { createClientForToken } from "@/lib/supabase/as-user";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import { requireFinancePlan } from "@/lib/finance/actions";
import { getAccountingSummary, getLedgerEntries } from "@/lib/accounting/dal";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The staff mobile app's Accounting overview and ledger: the web's own totals,
// category breakdowns and running balance, run as the signed-in person.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "";
  const view = url.searchParams.get("view");
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  const branchId = url.searchParams.get("branchId") || undefined;

  const auth = await requireMobileTabAccess(request, organizationId, "accounting", "read");
  if (auth instanceof NextResponse) return auth;
  const planError = await requireFinancePlan(organizationId);
  if (planError) return NextResponse.json({ ok: false, error: planError });
  if ((view !== "summary" && view !== "ledger") || !DATE.test(start) || !DATE.test(end) || end < start) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const token = (request.headers.get("authorization") ?? "").slice("Bearer ".length);
  const client = createClientForToken(token);
  const range = { start, end };

  if (view === "summary") {
    return NextResponse.json({ ok: true, ...(await getAccountingSummary(organizationId, range, branchId, client)) });
  }
  return NextResponse.json({ ok: true, ...(await getLedgerEntries(organizationId, range, branchId, client)) });
}
