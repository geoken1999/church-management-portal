import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getOrganizationPayoutDetails } from "@/lib/organizations/payout-details-dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";
import { MembershipFeeSettingsForm } from "@/components/membership/MembershipFeeSettingsForm";
import { RequestMembershipPayoutButton } from "@/components/membership/RequestMembershipPayoutButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  membershipPeriodFor,
  membershipPeriodLabel,
  shiftMembershipPeriod,
  summarizeMembershipPeriod,
} from "@/lib/membership-fees/config";
import { getMembershipFeeSettings, getMembershipInvoicesForPeriod, getMembershipLedger } from "@/lib/membership-fees/dal";
import { SHARED_SERVICE_FEE_RATE, sharedServiceNetAmount } from "@/lib/finance/fees";
import { formatInTimezone } from "@/lib/organizations/timezone";
import type { MembershipInvoiceStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Membership fees | KingdomFlow",
};

const FEE_PERCENT = `${SHARED_SERVICE_FEE_RATE * 100}%`;

function money(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadge(status: MembershipInvoiceStatus) {
  if (status === "paid") return <Badge variant="secondary">Paid</Badge>;
  if (status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  return <Badge variant="destructive">Unpaid</Badge>;
}

export default async function MembershipFeesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const timezone = membership.organization.timezone;

  const { plan } = await getPlanUsage(organizationId);
  if (!plan.financeEnabled) {
    return <UpgradeRequired label="Membership fees" plan={plan.name} />;
  }
  if (!membership.tabAccess.donations.read) {
    return <AccessRestricted label="Membership fees" />;
  }

  const canWrite = membership.tabAccess.donations.write;
  const { period: periodParam } = await searchParams;
  const period = periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : membershipPeriodFor(new Date(), timezone);

  const [settings, invoices, ledger, payoutDetails] = await Promise.all([
    getMembershipFeeSettings(organizationId),
    getMembershipInvoicesForPeriod(organizationId, period),
    getMembershipLedger(organizationId),
    getOrganizationPayoutDetails(organizationId),
  ]);

  const summary = summarizeMembershipPeriod(
    invoices.map((i) => ({ amount: Number(i.amount), status: i.status, hasEmail: Boolean(i.memberEmail) })),
  );
  const currentPeriod = membershipPeriodFor(new Date(), timezone);
  const canGoForward = period < currentPeriod;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/dashboard/donations" />}>
            <ArrowLeft className="size-4" />
            Donations
          </Button>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Membership fees</h1>
          <p className="mt-1 text-muted-foreground">
            Each active member is asked for the monthly fee by email, with a payment link. Payments go through KingdomFlow&apos;s shared account,
            and the balance is paid out to you on request, less the {FEE_PERCENT} fee.
          </p>
        </div>
        <Button variant="outline" nativeButton={false} render={<a href={`/dashboard/membership-fees/export?period=${period}`} />}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
          <CardDescription>
            {settings?.enabled ? "Collecting monthly fees." : "Off. Nothing is requested from members until you turn this on."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MembershipFeeSettingsForm settings={settings} canWrite={canWrite} />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-xl font-bold">{membershipPeriodLabel(period)}</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard/membership-fees?period=${shiftMembershipPeriod(period, -1)}`} />}>
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            {canGoForward && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard/membership-fees?period=${shiftMembershipPeriod(period, 1)}`} />}>
                Next
                <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Expected" value={money(summary.expected)} hint={`${summary.requested} members`} />
          <SummaryCard label="Collected" value={money(summary.collected)} hint={`${summary.paidCount} paid`} />
          <SummaryCard label="Outstanding" value={money(summary.outstanding)} hint={`${summary.dueCount} unpaid`} />
          <SummaryCard label="No email on file" value={String(summary.withoutEmailCount)} hint="Can't be sent a link" />
        </div>

        {invoices.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No requests for this month. Requests are created on the day set above, once fees are turned on.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Member</th>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Paid on</th>
                    <th className="px-4 py-2 font-medium">Request sent</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{row.memberName}</td>
                      <td className="px-4 py-2 text-muted-foreground">{row.memberEmail ?? "No email"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(Number(row.amount))}</td>
                      <td className="px-4 py-2">{statusBadge(row.status)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {row.paid_at ? formatInTimezone(row.paid_at, timezone, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {row.request_sent_at
                          ? formatInTimezone(row.request_sent_at, timezone, { day: "numeric", month: "short" })
                          : row.memberEmail
                            ? "Not yet"
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold">Payouts</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Collected, all time" value={money(ledger.collected)} />
          <SummaryCard label={`Platform fee (${FEE_PERCENT})`} value={money(ledger.collected - sharedServiceNetAmount(ledger.collected))} />
          <SummaryCard label="Paid out" value={money(ledger.paidOut)} />
          <SummaryCard label="Owed to you" value={money(Math.max(0, ledger.owed))} />
        </div>
        <Card>
          <CardContent className="space-y-4 py-6">
            {ledger.pendingRequest ? (
              <p className="text-sm">
                A payout of {money(Number(ledger.pendingRequest.amount))} has been requested and is waiting to be sent.
              </p>
            ) : payoutDetails ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Sent to your saved {payoutDetails.payoutMethod === "upi" ? `UPI ID ${payoutDetails.upiId}` : `bank account ending ${(payoutDetails.bankAccountNumber ?? "").slice(-4)}`}.
                </p>
                {canWrite && <RequestMembershipPayoutButton disabled={ledger.owed <= 0} />}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Save your UPI or bank details in organization settings before requesting a payout.
              </p>
            )}
            {ledger.payouts.length > 0 && (
              <ul className="divide-y text-sm">
                {ledger.payouts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">{formatInTimezone(p.created_at, timezone, { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span className="tabular-nums">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl font-bold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
