import type { Metadata } from "next";
import { getDesigns } from "@/lib/designer/dal";
import { requireStudio } from "@/lib/designer/guard";
import { DesignerGallery } from "@/components/designer/DesignerGallery";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "My designs | KingdomFlow",
};

export default async function MyDesignsPage({ searchParams }: { searchParams: Promise<{ new?: string; ai?: string; thumb?: string }> }) {
  const { membership, allowed } = await requireStudio();
  if (!allowed) return <AccessRestricted label="Design Studio" />;
  const { new: newDesign, ai, thumb } = await searchParams;
  const designs = await getDesigns(membership.organization.id);

  return (
    <DesignerGallery
      organizationId={membership.organization.id}
      churchName={membership.organization.name}
      logoUrl={membership.organization.logo_url}
      designs={designs}
      canWrite={membership.tabAccess.designer.write}
      canDelete={membership.tabAccess.designer.delete}
      start={thumb ? "thumbnail" : ai ? "ai" : newDesign ? "new" : undefined}
    />
  );
}
