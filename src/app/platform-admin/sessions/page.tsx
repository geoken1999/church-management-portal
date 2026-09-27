import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getActiveSessions } from "@/lib/platform-admin/dal";
import { RevokeSessionButton } from "@/components/platform-admin/RevokeSessionButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

export default async function PlatformAdminSessionsPage() {
  await requirePlatformAdmin();
  const sessions = await getActiveSessions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Active Sessions</h1>
        <p className="mt-1 text-muted-foreground">
          Every currently-valid sign-in across all tenants. Signing someone out here takes effect on their very next
          request — it doesn&apos;t wait for their access token to expire.
        </p>
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
