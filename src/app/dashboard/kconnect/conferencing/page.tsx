import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getConferenceMeetings, getConnectionSummary } from "@/lib/conferencing/dal";
import { getZoomEnv } from "@/lib/conferencing/zoom";
import { getMeetEnv } from "@/lib/conferencing/google-meet";
import { isConnectionSecretsConfigured } from "@/lib/security/connection-secrets";
import { ConferencingManager } from "@/components/conferencing/ConferencingManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Zoom and Google Meet | KingdomFlow" };
export const dynamic = "force-dynamic";

// Zoom and Google Meet meetings, made from KingdomFlow with the church's own accounts. Zoom opens inside KingdomFlow
// with all of Zoom's controls; Google Meet opens in its own tab.
// What is missing from the server's settings, for an owner or admin to pass on (never shown to other people).
const missing = (providerKeys: boolean, names: string) => [providerKeys ? null : names, isConnectionSecretsConfigured() ? null : "CONNECTION_SECRETS_KEY"].filter(Boolean).join(" and ");

export default async function ConferencingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const membership = await requireOrganization();
  const access = membership.tabAccess.kmeet;
  if (!access.read) return <AccessRestricted label="K-Connect" />;
  const organizationId = membership.organization.id;

  const [zoom, meet, meetings] = await Promise.all([getConnectionSummary(organizationId, "zoom"), getConnectionSummary(organizationId, "google_meet"), getConferenceMeetings(organizationId)]);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/dashboard/kconnect" />}>
          <ArrowLeft className="size-4" />
          K-Connect
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Zoom and Google Meet</h1>
        <p className="mt-1 text-muted-foreground">Make Zoom and Google Meet meetings from here with your church&apos;s own accounts. Zoom opens inside KingdomFlow with all of Zoom&apos;s controls; Google Meet opens in its own tab.</p>
      </div>
      <ConferencingManager
        status={status ?? null}
        canWrite={access.write}
        canConnect={membership.role === "owner" || membership.role === "admin"}
        zoom={{ available: !!getZoomEnv() && isConnectionSecretsConfigured(), missing: missing(!!getZoomEnv(), "ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET"), account: zoom }}
        meet={{ available: !!getMeetEnv() && isConnectionSecretsConfigured(), missing: missing(!!getMeetEnv(), "GOOGLE_MEET_CLIENT_ID and GOOGLE_MEET_CLIENT_SECRET (or the YouTube ones)"), account: meet }}
        meetings={meetings.map((m) => ({ id: m.id, provider: m.provider, title: m.title, startTime: m.start_time, durationMinutes: m.duration_minutes, joinUrl: m.join_url, passcode: m.passcode }))}
        timezone={membership.organization.timezone}
      />
    </div>
  );
}
