import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getLiveStream } from "@/lib/livestream/dal";
import { getSiteUrl } from "@/lib/site-url";
import { LiveStudio } from "@/components/livestream/LiveStudio";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Live stream | KingdomFlow",
};

export default async function LiveStreamStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await requireOrganization();
  if (!membership.tabAccess.livestream.read) return <AccessRestricted label="Live stream" />;
  const stream = await getLiveStream(membership.organization.id, id);
  if (!stream) notFound();

  const canWrite = membership.tabAccess.livestream.write;
  return (
    <div className="space-y-6">
      <Link href="/dashboard/livestream" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        All live streams
      </Link>
      <LiveStudio stream={{ ...stream, rtmp_outputs: stream.rtmp_outputs.map((o) => ({ ...o, streamKey: "" })), ingest_key: canWrite ? stream.ingest_key : "" }} whipUrl={`${getSiteUrl()}/api/whip/${stream.id}`} canWrite={membership.tabAccess.livestream.write} />
    </div>
  );
}
