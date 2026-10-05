import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { membershipPeriodLabel } from "@/lib/membership-fees/config";
import { MembershipPayButton } from "@/components/membership/MembershipPayButton";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Membership fee | KingdomFlow",
};

// Public: the link itself is the credential. Shows only what the member needs
// to pay (the church's name, the month and the amount), never other members'
// details.
export default async function MembershipPaymentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("membership_fee_invoices")
    .select("organization_id, amount, status, period")
    .eq("public_token", token)
    .maybeSingle();

  if (!invoice) {
    return <Notice title="Payment link not found" body="This link isn't valid. Ask your church for a new one." />;
  }

  const { data: org } = await admin.from("organizations").select("name").eq("id", invoice.organization_id).maybeSingle();
  const churchName = org?.name ?? "Your church";
  const periodLabel = membershipPeriodLabel(invoice.period);
  const amount = Number(invoice.amount);

  if (invoice.status === "paid") {
    return <Notice title="Already paid" body={`The ${periodLabel} membership fee for ${churchName} has been paid. Thank you!`} />;
  }
  if (invoice.status !== "due") {
    return <Notice title="No longer open" body="This payment request has been closed. Contact the church if you think this is a mistake." />;
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{churchName}</p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Membership fee</h1>
        <p className="mt-1 text-muted-foreground">{periodLabel}</p>
      </div>
      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Amount due</p>
            <p className="font-heading text-3xl font-bold tabular-nums">
              ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <MembershipPayButton token={token} amount={amount} />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">Payments are processed securely by Razorpay.</p>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardContent className="space-y-2 py-10 text-center">
          <h1 className="font-heading text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{body}</p>
        </CardContent>
      </Card>
    </div>
  );
}
