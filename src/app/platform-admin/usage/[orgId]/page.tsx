import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getChurchCampaigns, monthWindow } from "@/lib/platform-admin/usage-report";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { membershipPeriodFor, membershipPeriodLabel } from "@/lib/membership-fees/config";
import { formatPlatformDateTime } from "@/lib/platform-admin/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Church usage | KingdomFlow",
};

const CHANNEL_LABEL = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" } as const;

function statusBadge(status: string) {
  if (status === "sent") return <Badge variant="secondary">Sent</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">{status.replace("_", " ")}</Badge>;
}

export default async function ChurchUsageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  await requirePlatformAdmin();
  const { orgId } = await params;
  const { month: monthParam } = await searchParams;
  const current = membershipPeriodFor(new Date(), DEFAULT_TIMEZONE);
  const month = monthParam && monthWindow(monthParam) ? monthParam : current;
  const window = monthWindow(month)!;

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
  if (!org) notFound();

  const campaigns = await getChurchCampaigns(orgId, window);
  const totals = campaigns.reduce(
    (t, c) => ({ sent: t.sent + c.sent, failed: t.failed + c.failed }),
    { sent: 0, failed: 0 },
  );

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href={`/platform-admin/usage?month=${month}`} />}>
          <ArrowLeft className="size-4" />
          All churches
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{org.name}</h1>
        <p className="mt-1 text-muted-foreground">
          Campaigns sent in {membershipPeriodLabel(month)}: {totals.sent.toLocaleString("en-IN")} sent, {totals.failed.toLocaleString("en-IN")} failed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaigns</CardTitle>
          <CardDescription>Each campaign with its recipients, how many were sent or failed, and the final status.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {campaigns.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No campaigns this month.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Channel</th>
                  <th className="px-4 py-2 font-medium">Message</th>
                  <th className="px-4 py-2 text-right font-medium">Recipients</th>
                  <th className="px-4 py-2 text-right font-medium">Sent</th>
                  <th className="px-4 py-2 text-right font-medium">Failed</th>
                  <th className="px-4 py-2 font-medium">Sender</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={`${c.channel}-${c.id}`} className="border-b last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap">{formatPlatformDateTime(c.date)}</td>
                    <td className="px-4 py-2">{CHANNEL_LABEL[c.channel]}</td>
                    <td className="max-w-xs truncate px-4 py-2" title={c.label}>
                      {c.label}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.recipients}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.sent}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${c.failed > 0 ? "text-destructive" : ""}`}>{c.failed}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.via ?? "—"}</td>
                    <td className="px-4 py-2">{statusBadge(c.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
