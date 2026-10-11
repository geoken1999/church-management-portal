import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getWhatsAppHealth } from "@/lib/whatsapp/health";
import { REPUTATION_MAX_LIMIT_RATE, REPUTATION_MIN_RESOLVED, REPUTATION_WINDOW_DAYS, limitRate, shouldPauseMarketing } from "@/lib/whatsapp/reputation-rules";
import { MarketingOverrideButton } from "@/components/platform-admin/MarketingOverrideButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "WhatsApp Health | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

export default async function PlatformAdminWhatsAppHealthPage() {
  await requirePlatformAdmin();
  const table = await getWhatsAppHealth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">WhatsApp health</h1>
        <p className="mt-1 text-muted-foreground">
          How WhatsApp is treating each church&apos;s marketing messages. On the shared number every church counts toward one quality rating, so a church whose messages keep being refused
          (error 131049) is paused for marketing once at least {REPUTATION_MIN_RESOLVED} of its messages in the last {REPUTATION_WINDOW_DAYS} days have a result and {Math.round(REPUTATION_MAX_LIMIT_RATE * 100)}%
          or more were refused. Churches with their own number aren&apos;t paused. You can lift the pause for a church here.
        </p>
      </div>

      {table.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No tracked WhatsApp messages in the last 30 days yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {table.map((org) => {
            const paused = org.onShared && shouldPauseMarketing(org.week) && !org.override;
            return (
              <Card key={org.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{org.name}</span>
                      <Badge variant="outline">{org.onShared ? "Shared number" : "Own number"}</Badge>
                      {paused && <Badge variant="destructive">Marketing paused</Badge>}
                      {org.override && <Badge variant="secondary">Pause lifted</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last {REPUTATION_WINDOW_DAYS} days: {org.week.limited} of {org.week.resolved} marketing messages refused ({Math.round(limitRate(org.week) * 100)}%) · Last 30 days: {org.month.limited} of{" "}
                      {org.month.resolved} ({Math.round(limitRate(org.month) * 100)}%)
                    </p>
                  </div>
                  {org.onShared && <MarketingOverrideButton organizationId={org.id} overridden={org.override} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
