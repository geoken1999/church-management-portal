import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrganization } from "@/lib/organizations/dal";
import { getLiveStreams } from "@/lib/livestream/dal";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { endIdleMeetings } from "@/lib/kmeet/idle";
import { getLiveStreamAccess } from "@/lib/livestream/access";
import { LiveStreamLocked } from "@/components/livestream/LiveStreamLocked";
import { LiveStreamManager } from "@/components/livestream/LiveStreamManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Live stream | KingdomFlow",
};

export default async function LiveStreamPage() {
  const membership = await requireOrganization();
  const access = membership.tabAccess.livestream;
  if (!access.read) return <AccessRestricted label="Live stream" />;

  const live = await getLiveStreamAccess(membership.organization.id);
  if (!live.enabled) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Live stream</h1>
        <LiveStreamLocked requestedAt={live.requestedAt} canRequest={membership.role === "owner" || membership.role === "admin"} />
      </div>
    );
  }

  await endIdleMeetings(membership.organization.id);
  const streams = await getLiveStreams(membership.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Live stream</h1>
        <p className="mt-1 text-muted-foreground">Broadcast your service. Members watch live inside the app, with chat, and from OBS you can also go live on YouTube or Facebook yourself.</p>
        <Button className="mt-3" variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/livestream/projection" />}>
          <BookOpen className="size-4" />
          Verse projection
        </Button>
      </div>
      <LiveStreamManager streams={streams.map((s) => ({ ...s, rtmp_outputs: s.rtmp_outputs.map((o) => ({ ...o, streamKey: "" })), ingest_key: "" }))} canWrite={access.write} canDelete={access.delete} available={isVideoSdkConfigured()} />
    </div>
  );
}
