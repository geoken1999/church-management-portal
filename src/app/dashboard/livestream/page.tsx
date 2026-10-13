import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getLiveStreams } from "@/lib/livestream/dal";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { endIdleMeetings } from "@/lib/kmeet/idle";
import { LiveStreamManager } from "@/components/livestream/LiveStreamManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Live stream | KingdomFlow",
};

export default async function LiveStreamPage() {
  const membership = await requireOrganization();
  const access = membership.tabAccess.livestream;
  if (!access.read) return <AccessRestricted label="Live stream" />;

  await endIdleMeetings(membership.organization.id);
  const streams = await getLiveStreams(membership.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Live stream</h1>
        <p className="mt-1 text-muted-foreground">Broadcast your service. Members watch live inside the app, with chat, and you can also send it to YouTube or Facebook.</p>
      </div>
      <LiveStreamManager streams={streams.map((s) => ({ ...s, rtmp_outputs: s.rtmp_outputs.map((o) => ({ ...o, streamKey: "" })), ingest_key: "" }))} canWrite={access.write} canDelete={access.delete} available={isVideoSdkConfigured()} />
    </div>
  );
}
