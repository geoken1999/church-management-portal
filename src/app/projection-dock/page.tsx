import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getSiteUrl } from "@/lib/site-url";
import { loadConsoleData } from "@/lib/projection/console-data";
import { ProjectionConsole } from "@/components/projection/ProjectionConsole";

export const metadata: Metadata = { title: "Verse projection dock | KingdomFlow" };
export const dynamic = "force-dynamic";

// The projection controls on a page of their own, narrow enough to sit in OBS as a custom browser dock
// (View -> Docks -> Custom Browser Docks). It uses the same sign-in as the dashboard: sign in once inside the dock.
export default async function ProjectionDockPage() {
  const membership = await requireOrganization();
  const access = membership.tabAccess.livestream;
  if (!access.read) return <p className="p-4 text-sm text-muted-foreground">Your account doesn&apos;t have access to Live stream, which includes verse projection.</p>;
  const data = await loadConsoleData(membership.organization.id);
  return (
    <ProjectionConsole
      dock
      organizationId={membership.organization.id}
      token={data.token}
      siteUrl={getSiteUrl()}
      initial={data.initial}
      items={data.items}
      translations={data.translations}
      canWrite={access.write}
    />
  );
}
