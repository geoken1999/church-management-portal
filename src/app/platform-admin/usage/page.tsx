import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getChurchUsageReport, monthWindow, totalSent } from "@/lib/platform-admin/usage-report";
import { DEFAULT_TIMEZONE, dateKeyInTimezone } from "@/lib/organizations/timezone";
import { membershipPeriodFor, membershipPeriodLabel, shiftMembershipPeriod } from "@/lib/membership-fees/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Church usage | KingdomFlow",
};

function deliverySummary(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length === 0 ? "—" : entries.map(([status, n]) => `${n} ${status}`).join(" · ");
}

export default async function ChurchUsagePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePlatformAdmin();
  const { month: monthParam } = await searchParams;
  const current = membershipPeriodFor(new Date(), DEFAULT_TIMEZONE);
  const month = monthParam && monthWindow(monthParam) ? monthParam : current;
  const window = monthWindow(month)!;
  const rows = await getChurchUsageReport(window);

  const totals = rows.reduce(
    (t, r) => ({
      email: t.email + r.email.sent,
      sms: t.sms + r.sms.sent,
      whatsapp: t.whatsapp + r.whatsapp.sent,
      failed: t.failed + r.email.failed + r.sms.failed + r.whatsapp.failed,
    }),
    { email: 0, sms: 0, whatsapp: 0, failed: 0 },
  );

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Church usage</h1>
          <p className="mt-1 text-muted-foreground">
            Messages each church has sent in {membershipPeriodLabel(month)}, by channel, with failures and the delivery results the providers reported.
            Counted in Indian time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/platform-admin/usage?month=${shiftMembershipPeriod(month, -1)}`} />}>
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          {month < current && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/platform-admin/usage?month=${shiftMembershipPeriod(month, 1)}`} />}>
              Next
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Emails sent" value={totals.email} />
        <Stat label="SMS sent" value={totals.sms} />
        <Stat label="WhatsApp sent" value={totals.whatsapp} />
        <Stat label="Failed (all channels)" value={totals.failed} tone={totals.failed > 0 ? "bad" : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By church</CardTitle>
          <CardDescription>Sorted by total messages sent. Membership emails and AI replies are shown separately from campaigns.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Church</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 text-right font-medium">Email</th>
                <th className="px-4 py-2 text-right font-medium">SMS</th>
                <th className="px-4 py-2 text-right font-medium">WhatsApp</th>
                <th className="px-4 py-2 text-right font-medium">Membership</th>
                <th className="px-4 py-2 text-right font-medium">Automation</th>
                <th className="px-4 py-2 text-right font-medium">AI replies</th>
                <th className="px-4 py-2 text-right font-medium">Failed</th>
                <th className="px-4 py-2 font-medium">Delivery reported</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                    No churches yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const failed = r.email.failed + r.sms.failed + r.whatsapp.failed;
                return (
                  <tr key={r.organizationId} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/platform-admin/usage/${r.organizationId}?month=${month}`}>
                        {r.organizationName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.planName}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.email.sent}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.sms.sent}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.whatsapp.sent}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.membershipEmails}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.automationMessages}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.aiReplies}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${failed > 0 ? "text-destructive" : ""}`}>{failed}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{deliverySummary(r.deliveryByStatus)}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{totalSent(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Today: {dateKeyInTimezone(new Date(), DEFAULT_TIMEZONE)}. WhatsApp campaign deliveries aren&apos;t attributed to a church in the delivery column yet, so
        that column can under-count WhatsApp.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-heading text-2xl font-bold tabular-nums ${tone === "bad" ? "text-destructive" : ""}`}>{value.toLocaleString("en-IN")}</p>
      </CardContent>
    </Card>
  );
}
