import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getPlatformEvents } from "@/lib/platform-admin/dal";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlatformEventLevel } from "@/types/database";

export const metadata: Metadata = {
  title: "Logs | KingdomFlow Super Admin",
};

const LEVEL_VARIANTS: Record<PlatformEventLevel, "default" | "secondary" | "destructive"> = {
  info: "secondary",
  warning: "default",
  error: "destructive",
};

const LEVEL_FILTERS: { label: string; value: PlatformEventLevel | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Errors", value: "error" },
  { label: "Warnings", value: "warning" },
  { label: "Info", value: "info" },
];

export default async function PlatformAdminLogsPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  await requirePlatformAdmin();
  const { level } = await searchParams;
  const activeLevel = level === "error" || level === "warning" || level === "info" ? level : undefined;

  const events = await getPlatformEvents({ level: activeLevel, limit: 200 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Logs</h1>
        <p className="mt-1 text-muted-foreground">
          A record of instrumented events — send failures, webhook signature failures, quota limits hit, and platform admin
          actions. This isn&apos;t raw server/request logs; those live in Vercel&apos;s own dashboard.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {LEVEL_FILTERS.map((filter) => (
          <Link
            key={filter.label}
            href={filter.value ? `/platform-admin/logs?level=${filter.value}` : "/platform-admin/logs"}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeLevel === filter.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Nothing logged yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <Card key={event.id}>
              <CardContent className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={LEVEL_VARIANTS[event.level]}>{event.level}</Badge>
                    <span className="text-xs font-medium text-muted-foreground">{event.source}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm">{event.message}</p>
                {Object.keys(event.metadata).length > 0 && (
                  <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                    {JSON.stringify(event.metadata)}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
