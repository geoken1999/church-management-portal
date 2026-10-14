import { NextResponse } from "next/server";
import { requireMobileAdmin } from "@/lib/mobile/staff-auth";
import { getPlanUsage } from "@/lib/plans/dal";

// The staff mobile app's Billing: the church's plan and what it has used this
// month. Owner and admin only, as on the web. Changing plan or buying add-ons
// (card payments) happens on the web.
export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
  const auth = await requireMobileAdmin(request, organizationId);
  if (auth instanceof NextResponse) return auth;
  const u = await getPlanUsage(organizationId);
  const p = u.plan;
  const line = (label: string, used: number, limit: number | null) => ({ label, used, limit });
  return NextResponse.json({
    ok: true,
    plan: p.name,
    price: `${p.priceLabel} + 18% GST`,
    status: u.accessStatus,
    trialDaysRemaining: u.trialDaysRemaining,
    usage: [
      line("Emails this month", u.emailsSentThisMonth, u.emailsSentThisMonth + u.emailsRemaining),
      line("SMS this month", u.smsSentThisMonth, u.smsSentThisMonth + u.smsRemaining),
      line("WhatsApp this month", u.whatsappSentThisMonth, u.whatsappSentThisMonth + u.whatsappRemaining),
      line("AI replies this month", u.aiRepliesSentThisMonth, u.aiRepliesSentThisMonth + u.aiRepliesRemaining),
      line("Admin seats", u.additionalAdmins, p.maxAdditionalAdmins),
      line("Staff seats", u.additionalStaff, p.maxAdditionalStaff),
    ],
    storage: { usedBytes: u.storageBytesUsed, limitBytes: u.storageBytesUsed + u.storageBytesRemaining },
  });
}
