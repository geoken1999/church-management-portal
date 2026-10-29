import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { getDesign } from "@/lib/designer/dal";
import { sanitizeDoc } from "@/lib/designer/model";
import { DesignerEditor } from "@/components/designer/DesignerEditor";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Design Studio | KingdomFlow",
};

export default async function DesignEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await requireOrganization();
  if (!membership.tabAccess.designer.read) return <AccessRestricted label="Design Studio" />;

  const design = await getDesign(membership.organization.id, id);
  if (!design) notFound();
  const checked = sanitizeDoc(design.doc);
  if ("error" in checked) notFound();

  return (
    <DesignerEditor
      designId={design.id}
      initialName={design.name}
      initialDoc={checked.doc}
      canWrite={membership.tabAccess.designer.write}
      logoUrl={membership.organization.logo_url}
      churchName={membership.organization.name}
    />
  );
}
