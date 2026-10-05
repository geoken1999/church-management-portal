import { NextResponse } from "next/server";
import { getActiveOrganization } from "@/lib/organizations/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { getMembershipInvoicesForPeriod } from "@/lib/membership-fees/dal";
import { membershipPeriodFor } from "@/lib/membership-fees/config";

// CSV of one month's membership fee requests. Read through the signed-in
// user's session, and gated on Donations read access like the page itself.
export async function GET(request: Request) {
  const membership = await getActiveOrganization();
  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const organizationId = membership.organization.id;
  const access = await checkTabAccess(organizationId, "donations", "read");
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: 403 });
  }

  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period");
  const period = periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : membershipPeriodFor(new Date(), membership.organization.timezone);

  const rows = await getMembershipInvoicesForPeriod(organizationId, period);
  const header = ["Member", "Email", "Period", "Amount", "Status", "Paid on", "Request sent", "Payment reference"];
  const lines = rows.map((r) =>
    [
      r.memberName,
      r.memberEmail ?? "",
      r.period,
      Number(r.amount).toFixed(2),
      r.status,
      r.paid_at ?? "",
      r.request_sent_at ?? "",
      r.razorpay_payment_id ?? "",
    ].map(csvCell).join(","),
  );

  return new NextResponse([header.join(","), ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="membership-fees-${period}.csv"`,
    },
  });
}

// Quotes every cell and doubles any embedded quotes, so names with commas
// or quotes can't break the file.
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
