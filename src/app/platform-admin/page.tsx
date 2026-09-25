import type { Metadata } from "next";
import Link from "next/link";
import { Building2, TrendingUp, Clock, AlertCircle, ArrowRight } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getPlatformOverview, getPlatformEvents } from "@/lib/platform-admin/dal";
import { PLANS } from "@/lib/plans/config";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Super Admin | KingdomFlow",
};

const LEVEL_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  info: "secondary",
  warning: "default",
  error: "destructive",
};

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Building2; label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <p className="text-xs font-medium">{label}</p>
        </div>
        <p className="font-heading text-2xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function PlatformAdminOverviewPage() {
  await requirePlatformAdmin();
  const [overview, recentEvents] = await Promise.all([getPlatformOverview(), getPlatformEvents({ limit: 8 })]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-muted-foreground">Every church on KingdomFlow, at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} label="Total tenants" value={overview.totalTenants} hint={`+${overview.newTenantsLast7Days} in the last 7 days`} />
        <StatCard icon={TrendingUp} label="Active subscriptions" value={overview.activeSubscriptions} />
        <StatCard icon={Clock} label="Trialing" value={overview.trialingCount} />
        <StatCard icon={AlertCircle} label="Expired / unpaid" value={overview.expiredCount} />
      </div>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Tenants by plan</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["basic", "premium", "pro"] as const).map((planId) => (
              <div key={planId} className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{PLANS[planId].name}</p>
                <p className="font-heading text-xl font-bold">{overview.planCounts[planId] ?? 0}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Recent activity</p>
            <Link href="/platform-admin/logs" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all logs
              <ArrowRight className="size-3" />
            </Link>
          </div>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
          ) : (
            <div className="space-y-2">
              {recentEvents.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{event.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.source} · {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={LEVEL_VARIANTS[event.level]}>{event.level}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
