import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Smartphone } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getActiveSessions } from "@/lib/platform-admin/dal";
import { LiveSessionsUsage } from "@/components/platform-admin/LiveSessionsUsage";
import { RevokeSessionButton } from "@/components/platform-admin/RevokeSessionButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SESSION_SOURCE_LABELS, sessionPerson, sessionSource, type SessionSource } from "@/lib/platform-admin/session-source";

export const metadata: Metadata = {
  title: "Sessions | KingdomFlow Super Admin",
};

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const FILTERS: { value: "all" | SessionSource; label: string }[] = [
  { value: "all", label: "All" },
  { value: "web", label: "Web" },
  { value: "mobile", label: "Mobile app" },
];

function SessionTabs({ live }: { live: boolean }) {
  const tab = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`;
  return (
    <div className="flex gap-1">
      <Link href="/platform-admin/sessions" className={tab(!live)}>
        Sign-ins
      </Link>
      <Link href="/platform-admin/sessions?view=live" className={tab(live)}>
        Live streams &amp; calls
      </Link>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function PlatformAdminSessionsPage({ searchParams }: { searchParams: Promise<{ source?: string; view?: string }> }) {
  await requirePlatformAdmin();
  const { source, view } = await searchParams;
  const liveView = view === "live";
  const active: "all" | SessionSource = source === "web" || source === "mobile" || source === "other" ? source : "all";

  if (liveView) {
    return (
      <div className="space-y-6">
        <SessionTabs live />
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Live streams and calls</h1>
          <p className="mt-1 text-muted-foreground">What each live session used: time in the room, what viewers watched and the data they pulled. Useful for billing churches that stream.</p>
        </div>
        <LiveSessionsUsage />
      </div>
    );
  }

  const all = (await getActiveSessions()).map((session) => ({ ...session, source: sessionSource(session.userAgent) }));
  const counts = { all: all.length, web: all.filter((s) => s.source === "web").length, mobile: all.filter((s) => s.source === "mobile").length };
  const sessions = active === "all" ? all : all.filter((s) => s.source === active);

  return (
    <div className="space-y-6">
      <SessionTabs live={false} />
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Active Sessions</h1>
        <p className="mt-1 text-muted-foreground">
          Every currently-valid sign-in across all tenants. Signing someone out here takes effect on their very next
          request — it doesn&apos;t wait for their access token to expire.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "all" ? "/platform-admin/sessions" : `/platform-admin/sessions?source=${filter.value}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active === filter.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {filter.label} ({counts[filter.value as keyof typeof counts] ?? 0})
          </Link>
        ))}
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No active sessions.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <Card key={session.sessionId}>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{session.userEmail}</span>
                    <Badge variant={session.source === "mobile" ? "default" : "outline"}>
                      {session.source === "mobile" ? <Smartphone className="size-3" /> : <Globe className="size-3" />}
                      {SESSION_SOURCE_LABELS[session.source]}
                    </Badge>
                    {session.source === "mobile" && <Badge variant="outline">{sessionPerson(session.hasEmail ? session.userEmail : null) === "team" ? "Team" : "Member"}</Badge>}
                    {session.organizationNames.length > 0 ? (
                      session.organizationNames.map((name) => (
                        <Badge key={name} variant="secondary">
                          {name}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">No organization</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Signed in {relativeTime(session.createdAt)}</span>
                    <span>Last active {relativeTime(session.updatedAt)}</span>
                    {session.userPhone && <span>{session.userPhone}</span>}
                    {session.ip && <span>{session.ip}</span>}
                  </div>
                  {session.userAgent && <p className="truncate text-xs text-muted-foreground">{session.userAgent}</p>}
                </div>
                <RevokeSessionButton sessionId={session.sessionId} userEmail={session.userEmail} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
