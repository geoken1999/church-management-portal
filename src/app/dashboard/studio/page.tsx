import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { getDesigns } from "@/lib/designer/dal";
import { DesignerGallery } from "@/components/designer/DesignerGallery";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Design Studio | KingdomFlow",
};

export default async function DesignerPage() {
  const membership = await requireOrganization();
  // A plan without Design Studio sends people to the page where they can subscribe to it on its own.
  if (membership.lockedTabs.includes("designer")) redirect("/dashboard/unlock/designer");
  if (!membership.tabAccess.designer.read) return <AccessRestricted label="Design Studio" />;

  const designs = await getDesigns(membership.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Design Studio</h1>
        <p className="mt-1 text-muted-foreground">Flyers, posters, social posts and YouTube thumbnails for {membership.organization.name}.</p>
      </div>
      <DesignerGallery
        organizationId={membership.organization.id}
        churchName={membership.organization.name}
        logoUrl={membership.organization.logo_url}
        designs={designs}
        canWrite={membership.tabAccess.designer.write}
        canDelete={membership.tabAccess.designer.delete}
      />
    </div>
  );
}
