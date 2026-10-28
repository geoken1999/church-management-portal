import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSupportAccess } from "@/lib/support-staff/access";
import { getTenantUsage } from "@/lib/platform-admin/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBytes } from "@/lib/plans/format";
import { formatPlatformDate, formatPlatformDateTime } from "@/lib/platform-admin/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Church | KingdomFlow Support" };
export const dynamic = "force-dynamic";

// What a support person needs to help a church, and nothing that moves money or changes the church: no billing
// amounts, gifts, payouts, plan controls or proof documents.
export default async function SupportTenantPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSupportAccess();
  const { id } = await params;
  const usage = await getTenantUsage(id);
  if (!usage) notFound();

  const admin = createAdminClient();
  const [{ data: tickets }, { data: events }] = await Promise.all([
    admin.from("support_tickets").select("id, subject, status, created_at").eq("organization_id", id).order("created_at", { ascending: false }).limit(10),
    admin.from("platform_events").select("level, source, message, created_at").eq("organization_id", id).order("created_at", { ascending: false }).limit(25),
  ]);
  const trialing = usage.trialEndsAt ? new Date(usage.trialEndsAt) > new Date() : false;
  const status = usage.subscriptionStatus === "active" ? "Active" : trialing ? "Trialing" : "Expired";

  const facts: [string, string][] = [
    ["Congregation members", String(usage.congregationMembers)],
    ["Branches", String(usage.branches)],
    ["Team logins", String(usage.teamLogins)],
    ["Events", String(usage.eventsCount)],
    ["Emails sent this month", String(usage.emailsSentThisMonth)],
    ["SMS sent this month", String(usage.smsSentThisMonth)],
    ["WhatsApp sent this month", String(usage.whatsappSentThisMonth)],
    ["Delivery failures (30 days)", String(usage.deliveryFailuresLast30Days)],
    ["Storage used", `${formatBytes(usage.storageBytesUsed)} of ${formatBytes(usage.storageBytesLimit)}`],
  ];

  return (
    <div className="space-y-6">
      <Link href="/support-desk/tenants" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Back to churches
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight">{usage.name}</h1>
          <Badge variant={status === "Expired" ? "destructive" : "secondary"}>{status}</Badge>
          <Badge variant="outline">{usage.planName}</Badge>
        </div>
        <p className="mt-1 text-muted-foreground">
          Joined {formatPlatformDate(usage.createdAt)}
          {usage.country && ` · ${usage.country}`}
          {usage.trialEndsAt && trialing && ` · Trial ends ${formatPlatformDate(usage.trialEndsAt)}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent tickets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(tickets ?? []).length === 0 && <p className="text-muted-foreground">None.</p>}
          {(tickets ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <span>{t.subject}</span>
              <span className="text-xs text-muted-foreground">
                {t.status} · {formatPlatformDateTime(t.created_at)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent platform events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(events ?? []).length === 0 && <p className="text-muted-foreground">Nothing logged for this church.</p>}
          {(events ?? []).map((e, i) => (
            <div key={i} className="flex flex-wrap items-start justify-between gap-2">
              <span>
                <Badge variant={e.level === "error" ? "destructive" : "outline"} className="mr-2">
                  {e.level}
                </Badge>
                {e.message}
              </span>
              <span className="text-xs text-muted-foreground">{formatPlatformDateTime(e.created_at)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
