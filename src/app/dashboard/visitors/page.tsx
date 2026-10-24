import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { VisitorsManager } from "@/components/visitors/VisitorsManager";
import { getVisitors } from "@/lib/visitors/dal";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = { title: "Visitors | KingdomFlow" };
export const dynamic = "force-dynamic";

// People → Visitors: first-time guests who scanned the church's QR code. Read-only here: they add themselves,
// are asked for feedback the next day on WhatsApp, and leave this list when they become members.
export default async function VisitorsPage() {
  const membership = await requireOrganization();
  const access = membership.tabAccess.visitors;
  if (!access.read) return <AccessRestricted label="Visitors" />;

  const visitors = await getVisitors(membership.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Visitors</h1>
        <p className="mt-1 text-muted-foreground">
          First-time guests scan your QR code and leave their details. The next day they get a WhatsApp message asking how their visit went and whether they&apos;d like a follow-up.
        </p>
      </div>
      <VisitorsManager
        visitors={visitors}
        orgName={membership.organization.name}
        link={`${getSiteUrl()}/visit/${membership.organization.slug}`}
        canWrite={access.write}
      />
    </div>
  );
}
