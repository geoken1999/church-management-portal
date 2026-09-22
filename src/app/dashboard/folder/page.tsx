import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getSharedDocuments, getFolderCategories } from "@/lib/folder/dal";
import { getSiteUrl } from "@/lib/site-url";
import { FolderManager } from "@/components/folder/FolderManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Folder | KingdomFlow",
};

export default async function FolderPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.folder.read) {
    return <AccessRestricted label="Folder" />;
  }

  const [documents, categories] = await Promise.all([getSharedDocuments(organizationId), getFolderCategories(organizationId)]);
  const siteUrl = getSiteUrl();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Folder</h1>
        <p className="mt-1 text-muted-foreground">Share documents with exactly who needs them.</p>
      </div>

      <FolderManager
        organizationId={organizationId}
        documents={documents}
        categories={categories}
        siteUrl={siteUrl}
        canWrite={membership.tabAccess.folder.write}
        canDelete={membership.tabAccess.folder.delete}
      />
    </div>
  );
}
