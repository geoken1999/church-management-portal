import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getOrganizationPayoutDetails } from "@/lib/organizations/payout-details-dal";
import { PAYOUT_STREAMS, STREAM_LABEL, getOrganizationPayoutLedger, type PayoutStream } from "@/lib/payouts/ledger";
import { formatInTimezone } from "@/lib/organizations/timezone";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";
import { PayoutDetailsCard } from "@/components/billing/PayoutDetailsCard";
import { RequestAllPayoutsButton } from "@/components/payouts/RequestAllPayoutsButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Payouts | KingdomFlow",
};

function money(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadge(status: string) {
  if (status === "paid") return <Badge variant="secondary">Paid</Badge>;
  if (status === "pending") return <Badge variant="destructive">Requested</Badge>;
  if (status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default async function PayoutsPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const timezone = membership.organization.timezone;

  const { plan } = await getPlanUsage(organizationId);
  if (!plan.financeEnabled) {
    return <UpgradeRequired label="Payouts" plan={plan.name} />;
  }

  const visible: PayoutStream[] = PAYOUT_STREAMS.filter((s) => membership.tabAccess[s.tab].read).map((s) => s.key);
  if (visible.length === 0) {
    return <AccessRestricted label="Payouts" />;
  }
  const canRequest = PAYOUT_STREAMS.some((s) => visible.includes(s.key) && membership.tabAccess[s.tab].write);

  const [ledger, details] = await Promise.all([getOrganizationPayoutLedger(organizationId, visible), getOrganizationPayoutDetails(organizationId)]);

  // Dates are shown as the church's calendar day.
  const day = (value: string) => formatInTimezone(`${value.slice(0, 10)}T12:00:00Z`, timezone, { day: "numeric", month: "short", year: "numeric" }, "en-IN");

  const anyOwed = ledger.balances.some((b) => b.owed > 0 && !b.pendingRequestId);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/dashboard/donations" />}>
            <ArrowLeft className="size-4" />
            Donations
          </Button>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Payouts</h1>
          <p className="mt-1 text-muted-foreground">
            Everything collected through KingdomFlow&apos;s shared account, from Fund Raisers, paid events and membership fees, less the 2.5% fee.
            Payouts are sent manually, so they aren&apos;t instant.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Collected" value={money(ledger.totals.collected)} />
        <SummaryCard label="Platform fee (2.5%)" value={money(ledger.totals.fee)} />
        <SummaryCard label="Paid out" value={money(ledger.totals.paidOut)} />
        <SummaryCard label="Owed to you" value={money(ledger.totals.owed)} />
      </div>

      {canRequest && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request a payout</CardTitle>
            <CardDescription>
              One request is made for each source that has money owed, sent to the saved payout details below. A source with a request already pending is
              skipped.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestAllPayoutsButton disabled={!anyOwed || !details} />
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">By source</h2>
        {ledger.balances.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">Nothing collected through the shared account yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Stream</th>
                    <th className="px-4 py-2 text-right font-medium">Collected</th>
                    <th className="px-4 py-2 text-right font-medium">Fee</th>
                    <th className="px-4 py-2 text-right font-medium">Paid out</th>
                    <th className="px-4 py-2 text-right font-medium">Owed</th>
                    <th className="px-4 py-2 font-medium">Request</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.balances.map((b) => (
                    <tr key={`${b.stream}-${b.sourceId ?? "org"}`} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{b.source}</td>
                      <td className="px-4 py-2 text-muted-foreground">{STREAM_LABEL[b.stream]}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(b.collected)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(b.fee)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(b.paidOut)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(Math.max(0, b.owed))}</td>
                      <td className="px-4 py-2">{b.pendingRequestId ? <Badge variant="destructive">Requested {money(b.pendingAmount ?? 0)}</Badge> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Payouts sent to you</h2>
        {ledger.transactions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No payouts have been sent yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">From</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.transactions.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap">{day(t.date)}</td>
                      <td className="px-4 py-2">
                        {t.source} <span className="text-muted-foreground">· {STREAM_LABEL[t.stream]}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(t.amount)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Where the money came from</h2>
        {ledger.collections.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No collections yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 text-right font-medium">Paid</th>
                    <th className="px-4 py-2 text-right font-medium">Fee</th>
                    <th className="px-4 py-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.collections.slice(0, 200).map((c) => (
                    <tr key={`${c.stream}-${c.id}`} className="border-b last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap">{day(c.date)}</td>
                      <td className="px-4 py-2">
                        {c.source} <span className="text-muted-foreground">· {STREAM_LABEL[c.stream]}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(c.gross)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(c.fee)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(c.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Payout requests</h2>
        {ledger.requests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No requests yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Requested</th>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.requests.map((r) => (
                    <tr key={`${r.stream}-${r.id}`} className="border-b last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap">{day(r.date)}</td>
                      <td className="px-4 py-2">
                        {r.source} <span className="text-muted-foreground">· {STREAM_LABEL[r.stream]}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(r.amount)}</td>
                      <td className="px-4 py-2">{statusBadge(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Payout details</h2>
        <p className="text-sm text-muted-foreground">Where payouts are sent. Only an owner or admin can change these.</p>
        <PayoutDetailsCard organizationId={organizationId} defaultValues={details} />
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
