import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getBranches } from "@/lib/branches/dal";
import { getMemberGroups } from "@/lib/members/groups";
import { MemberGroupsProvider } from "@/components/members/MemberGroups";
import { getWhatsAppCampaigns, getWhatsAppSendAvailability, getWhatsAppTemplates, getWhatsAppConversations, getWhatsAppConversationMessages } from "@/lib/whatsapp/dal";
import { resolvePhoneCountry } from "@/lib/whatsapp/validation";
import { getWhatsAppConnectionSummary } from "@/lib/whatsapp/credentials";
import { syncPlatformTemplatesForOrg } from "@/lib/whatsapp/platform-templates";
import { PlatformTemplatesCard } from "@/components/whatsapp/PlatformTemplatesCard";
import { createAdminClient } from "@/lib/supabase/admin";
import { WhatsAppConnectionCard } from "@/components/whatsapp/WhatsAppConnectionCard";
import { getSiteUrl } from "@/lib/site-url";
import { WhatsAppManager } from "@/components/whatsapp/WhatsAppManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "WhatsApp | KingdomFlow",
};

export default async function WhatsAppPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  const orgCountry = membership.organization.country;
  const isOrgAdmin = membership.role === "owner" || membership.role === "admin";

  if (!membership.tabAccess.whatsapp.read) {
    return <AccessRestricted label="WhatsApp" />;
  }

  // KingdomFlow's ready-made templates, copied in for churches on the shared
  // number before the list is read.
  await syncPlatformTemplatesForOrg(organizationId);

  const [members, branches, memberGroups, campaigns, templates, conversations, availability, connection] = await Promise.all([
    getMembers(organizationId),
    getBranches(organizationId),
    getMemberGroups(organizationId),
    getWhatsAppCampaigns(organizationId),
    getWhatsAppTemplates(organizationId),
    getWhatsAppConversations(organizationId),
    getWhatsAppSendAvailability(organizationId),
    getWhatsAppConnectionSummary(organizationId, isOrgAdmin),
  ]);

  const conversationsWithMessages = await Promise.all(
    conversations.map(async (conversation) => ({
      ...conversation,
      messages: await getWhatsAppConversationMessages(organizationId, conversation.id),
    })),
  );

  const branchCountryById = new Map(branches.map((branch) => [branch.id, branch.country]));

  const recipientOptions = members
    .filter((member) => member.status === "active" && member.phone)
    .map((member) => ({
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
      phone: member.phone as string,
      branchId: member.branch_id,
      branchName: member.branches?.name ?? null,
      countryCode: resolvePhoneCountry(member.branch_id ? branchCountryById.get(member.branch_id) : null, orgCountry),
    }));

  const branchOptions = branches.map((branch) => ({ id: branch.id, name: branch.name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">WhatsApp</h1>
        <p className="mt-1 text-muted-foreground">Send campaigns and reply to congregation queries over WhatsApp.</p>
      </div>

      <WhatsAppConnectionCard connection={connection} isOrgAdmin={isOrgAdmin} webhookUrl={`${getSiteUrl()}/api/whatsapp/webhook`} />

      {connection && isOrgAdmin && (
        <PlatformTemplatesCard
          templates={await getPlatformTemplatesForOwnNumber(templates.map((t) => t.name))}
        />
      )}

      <MemberGroupsProvider groups={memberGroups}>
        <WhatsAppManager
          organizationId={organizationId}
          canSend={membership.tabAccess.whatsapp.write}
          isOrgAdmin={isOrgAdmin}
          available={availability.available}
          whatsappRemaining={availability.whatsappRemaining}
          members={recipientOptions}
          branches={branchOptions}
          templates={templates}
          campaigns={campaigns}
          conversations={conversationsWithMessages}
          orgCountryCode={orgCountry}
        />
      </MemberGroupsProvider>
    </div>
  );
}

// For a church with its own number: the platform templates it hasn't added
// to its own account yet.
async function getPlatformTemplatesForOwnNumber(ownNames: string[]) {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_whatsapp_templates").select("id, name, body_text").eq("status", "approved");
  return (data ?? []).filter((t) => !ownNames.includes(t.name)).map((t) => ({ id: t.id, name: t.name, body: t.body_text }));
}
