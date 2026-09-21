import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getMediaTeamMembers, getMediaEquipment, getMediaSocialAccounts, getMediaDocuments } from "@/lib/media/dal";
import { createClient } from "@/lib/supabase/server";
import { MediaManager } from "@/components/media/MediaManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Media | KingdomFlow",
};

export default async function MediaPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.media.read) {
    return <AccessRestricted label="Media" />;
  }

  const [members, teamMembers, equipment, socialAccounts, documents] = await Promise.all([
    getMembers(organizationId),
    getMediaTeamMembers(organizationId),
    getMediaEquipment(organizationId),
    getMediaSocialAccounts(organizationId),
    getMediaDocuments(organizationId),
  ]);

  const supabase = await createClient();
  const documentsWithUrls = documents.map((document) => ({
    ...document,
    url: supabase.storage.from("media-documents").getPublicUrl(document.file_path).data.publicUrl,
  }));

  // Pending join requests haven't been approved yet, so they aren't
  // eligible to be assigned a media role.
  const assignableMembers = members
    .filter((member) => member.status !== "pending")
    .map((member) => ({ id: member.id, first_name: member.first_name, last_name: member.last_name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Media</h1>
        <p className="mt-1 text-muted-foreground">
          The team, equipment, and social accounts behind {membership.organization.name}&apos;s media ministry.
        </p>
      </div>

      <MediaManager
        organizationId={organizationId}
        members={assignableMembers}
        teamMembers={teamMembers}
        equipment={equipment}
        socialAccounts={socialAccounts}
        documents={documentsWithUrls}
        canManage={canManage}
      />
    </div>
  );
}
