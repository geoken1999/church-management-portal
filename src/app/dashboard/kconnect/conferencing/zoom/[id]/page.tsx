import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getConferenceMeeting } from "@/lib/conferencing/dal";
import { ZoomCall } from "@/components/conferencing/ZoomCall";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Zoom meeting | KingdomFlow" };
export const dynamic = "force-dynamic";

export default async function ZoomMeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ as?: string }> }) {
  const { id } = await params;
  const { as } = await searchParams;
  const membership = await requireOrganization();
  const access = membership.tabAccess.kmeet;
  if (!access.read) return <AccessRestricted label="K-Connect" />;
  const meeting = await getConferenceMeeting(membership.organization.id, id);
  if (!meeting || meeting.provider !== "zoom") notFound();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2" nativeButton={false} render={<Link href="/dashboard/kconnect/conferencing" />}>
            <ArrowLeft className="size-4" />
            Zoom and Google Meet
          </Button>
          <h1 className="font-heading text-2xl font-bold tracking-tight">{meeting.title}</h1>
        </div>
      </div>
      <ZoomCall meetingId={meeting.id} as={as === "host" && access.write ? "host" : "guest"} />
    </div>
  );
}
