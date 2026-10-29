import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getSiteUrl } from "@/lib/site-url";
import { loadConsoleData } from "@/lib/projection/console-data";
import { ProjectionConsole } from "@/components/projection/ProjectionConsole";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Verse projection | KingdomFlow" };
export const dynamic = "force-dynamic";

// Bible verses, song words and announcements, put on a screen or over the live stream video.
export default async function ProjectionPage() {
  const membership = await requireOrganization();
  const access = membership.tabAccess.livestream;
  if (!access.read) return <AccessRestricted label="Live stream" />;
  const organizationId = membership.organization.id;

  const data = await loadConsoleData(organizationId);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/dashboard/livestream" />}>
          <ArrowLeft className="size-4" />
          Live stream
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Verse projection</h1>
        <p className="mt-1 text-muted-foreground">Show Bible verses, song words and announcements on the screen in your hall, over the video in OBS, and to members watching in the app.</p>
      </div>
      <ProjectionConsole
        organizationId={organizationId}
        token={data.token}
        siteUrl={getSiteUrl()}
        initial={data.initial}
        items={data.items}
        translations={data.translations}
        canWrite={access.write}
      />
    </div>
  );
}
