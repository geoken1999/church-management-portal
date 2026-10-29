import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getDesigns } from "@/lib/designer/dal";
import { DesignerGallery } from "@/components/designer/DesignerGallery";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Designer | KingdomFlow",
};

export default async function DesignerPage() {
  const membership = await requireOrganization();
  if (!membership.tabAccess.media.read) return <AccessRestricted label="Media" />;

  const designs = await getDesigns(membership.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/media" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Media
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">Designer</h1>
        <p className="mt-1 text-muted-foreground">Flyers, posters and social posts for {membership.organization.name}.</p>
      </div>
      <DesignerGallery
        organizationId={membership.organization.id}
        churchName={membership.organization.name}
        designs={designs}
        canWrite={membership.tabAccess.media.write}
        canDelete={membership.tabAccess.media.delete}
      />
    </div>
  );
}
