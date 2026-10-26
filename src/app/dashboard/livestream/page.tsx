import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getLiveStreams } from "@/lib/livestream/dal";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { endIdleMeetings } from "@/lib/kmeet/idle";
import { getLiveStreamAccess } from "@/lib/livestream/access";
import { getActiveExternalLive } from "@/lib/livestream/external";
import { LiveStreamInstructions } from "@/components/livestream/LiveStreamInstructions";
import { LiveStreamLocked } from "@/components/livestream/LiveStreamLocked";
import { LiveStreamManager } from "@/components/livestream/LiveStreamManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Live stream | KingdomFlow",
};

// Two ways to go live. Everyone with the Live stream tab gets the first: OBS straight to YouTube or Facebook with their
// standard settings (the Instructions tab). The second, streaming inside the KingdomFlow app, runs on the video service
// and is switched on for a church by request.
export default async function LiveStreamPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: requested } = await searchParams;
  const membership = await requireOrganization();
  const access = membership.tabAccess.livestream;
  if (!access.read) return <AccessRestricted label="Live stream" />;

  const live = await getLiveStreamAccess(membership.organization.id);
  const tab = requested === "in-app" ? "in-app" : requested === "instructions" ? "instructions" : live.enabled ? "in-app" : "instructions";
  const tabClass = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`;

  const external = tab === "instructions" ? await getActiveExternalLive(membership.organization.id) : null;
  const streams = tab === "in-app" && live.enabled ? await getLiveStreams(membership.organization.id) : [];
  if (tab === "in-app" && live.enabled) await endIdleMeetings(membership.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Live stream</h1>
        <p className="mt-1 text-muted-foreground">Go live on YouTube or Facebook from OBS, or, once switched on for your church, stream inside the KingdomFlow app with live chat.</p>
        <Button className="mt-3" variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/livestream/projection" />}>
          <BookOpen className="size-4" />
          Verse projection
        </Button>
      </div>

      <div className="flex gap-1">
        <Link href="/dashboard/livestream?tab=instructions" className={tabClass(tab === "instructions")}>
          Instructions
        </Link>
        <Link href="/dashboard/livestream?tab=in-app" className={tabClass(tab === "in-app")}>
          In-app streaming
        </Link>
      </div>

      {tab === "instructions" ? (
        <LiveStreamInstructions canUseProjection canWrite={access.write} active={external ? { title: external.title, platform: external.platform, url: external.url } : null} />
      ) : live.enabled ? (
        <LiveStreamManager streams={streams.map((s) => ({ ...s, rtmp_outputs: s.rtmp_outputs.map((o) => ({ ...o, streamKey: "" })), ingest_key: "" }))} canWrite={access.write} canDelete={access.delete} available={isVideoSdkConfigured()} />
      ) : (
        <LiveStreamLocked requestedAt={live.requestedAt} canRequest={membership.role === "owner" || membership.role === "admin"} />
      )}
    </div>
  );
}
