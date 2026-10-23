import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getPlatformEarningsReport, REVENUE_SOURCE_LABELS } from "@/lib/platform-admin/finance";
import { SHARED_SERVICE_FEE_RATE } from "@/lib/finance/fees";
import { setEarningsStartAction } from "@/lib/platform-admin/expense-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Earnings | KingdomFlow",
};

const FEE_PERCENT = `${SHARED_SERVICE_FEE_RATE * 100}%`;

function money(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function whenLabel(iso: string): string {
  // A donation only has a day; everything else has a time.
  if (iso.length === 10) return dateLabel(iso);
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function PlatformEarningsPage() {
  await requirePlatformAdmin();
  const report = await getPlatformEarningsReport();

  return (
    <div className="max-w-5xl space-y-10">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Earnings</h1>
        <p className="mt-1 text-muted-foreground">
          What KingdomFlow earns: plan subscriptions, add-on packs, and the {FEE_PERCENT} fee on shared-account fundraiser and event payments.
          Money collected for churches is not counted as earnings. Months are shown in Indian time.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 py-4">
          <div className="text-sm">
            <p className="font-medium">
              {report.earningsStart ? `Counting payments from ${dateLabel(report.earningsStart)}` : "Counting every payment"}
            </p>
            <p className="text-muted-foreground">Earlier payments stay stored but are left out of every figure here. Church balances and payouts are not affected.</p>
          </div>
          <form action={setEarningsStartAction} className="flex items-end gap-2">
            <Input name="day" type="date" defaultValue={report.earningsStart ?? ""} className="w-40" />
            <Button type="submit" variant="outline">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Earned, all time" value={money(report.allTime.revenue)} />
        <SummaryCard label="Expenses, all time" value={money(report.allTime.expenses)} />
        <SummaryCard label="Net, all time" value={money(report.allTime.net)} tone={report.allTime.net >= 0 ? "good" : "bad"} />
        <SummaryCard label="Held for churches" value={money(report.allTime.heldForChurches)} hint="Gross on shared accounts, not earnings" />
        <SummaryCard label="Invested, all time" value={money(report.allTime.invested)} hint="Capital, investors and loans (not earnings)" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This month ({monthLabel(report.thisMonth.month)})</CardTitle>
          <CardDescription>
            Earned {money(report.thisMonth.revenue)} · Expenses {money(report.thisMonth.expenses)} · Net {money(report.thisMonth.net)}
          </CardDescription>
        </CardHeader>
      </Card>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Transactions</h2>
        <p className="text-sm text-muted-foreground">
          Every payment that counts, newest first (latest {report.transactions.length}). &ldquo;Earned&rdquo; is KingdomFlow&apos;s share; for shared-account fees the whole payment is shown too.
        </p>
        {report.transactions.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">No payments yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Church</th>
                    <th className="px-4 py-2 font-medium">What</th>
                    <th className="px-4 py-2 font-medium">Reference</th>
                    <th className="px-4 py-2 text-right font-medium">Payment</th>
                    <th className="px-4 py-2 text-right font-medium">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {report.transactions.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap">{whenLabel(t.when)}</td>
                      <td className="px-4 py-2">{t.churchName}</td>
                      <td className="px-4 py-2">
                        {t.description}
                        <span className="block text-xs text-muted-foreground">{t.sourceLabel}</span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{t.reference}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{t.gross === null ? "—" : money(t.gross)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{money(t.earned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Where it comes from</h2>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 text-right font-medium">Transactions</th>
                  <th className="px-4 py-2 text-right font-medium">Earned</th>
                </tr>
              </thead>
              <tbody>
                {report.bySource.map((row) => (
                  <tr key={row.source} className="border-b last:border-0">
                    <td className="px-4 py-2">{REVENUE_SOURCE_LABELS[row.source]}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        {report.subscriptionTrackingSince ? (
          <p className="text-xs text-muted-foreground">
            Plan subscription charges are recorded from {monthLabel(report.subscriptionTrackingSince)} onwards. Earlier charges were not stored,
            so subscription earnings before that month are not included.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No plan subscription charges have been recorded yet. They are stored as each charge comes in through the Razorpay webhook.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Last 12 months</h2>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 text-right font-medium">Earned</th>
                  <th className="px-4 py-2 text-right font-medium">Expenses</th>
                  <th className="px-4 py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {[...report.months].reverse().map((row) => (
                  <tr key={row.month} className="border-b last:border-0">
                    <td className="px-4 py-2">{monthLabel(row.month)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(row.revenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(row.expenses)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${row.net < 0 ? "text-destructive" : ""}`}>{money(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-heading text-2xl font-bold tabular-nums ${tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
