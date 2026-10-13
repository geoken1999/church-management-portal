import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getBranches } from "@/lib/branches/dal";
import { getMemberGroups } from "@/lib/members/groups";
import { MemberGroupsProvider } from "@/components/members/MemberGroups";
import { getWhatsAppCampaigns, getWhatsAppSendAvailability, getWhatsAppTemplates, getWhatsAppConversations, getWhatsAppConversationMessages } from "@/lib/whatsapp/dal";
import { resolvePhoneCountry } from "@/lib/whatsapp/validation";
import { syncPlatformTemplatesForOrg } from "@/lib/whatsapp/platform-templates";
import { MovedToSettings } from "@/components/settings/MovedToSettings";
import { WhatsAppManager } from "@/components/whatsapp/WhatsAppManager";
import { getScheduledCampaigns } from "@/lib/scheduler/dal";
import { sendOverdueCampaignsInBackground } from "@/lib/scheduler/backstop";
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

  const [members, branches, memberGroups, campaigns, templates, conversations, availability] = await Promise.all([
    getMembers(organizationId),
    getBranches(organizationId),
    getMemberGroups(organizationId),
    getWhatsAppCampaigns(organizationId),
    getWhatsAppTemplates(organizationId),
    getWhatsAppConversations(organizationId),
    getWhatsAppSendAvailability(organizationId),
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

  await sendOverdueCampaignsInBackground(organizationId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">WhatsApp</h1>
        <p className="mt-1 text-muted-foreground">Send campaigns and reply to congregation queries over WhatsApp.</p>
      </div>

      {isOrgAdmin && <MovedToSettings what="Your WhatsApp number, the backup channel and message templates" section="whatsapp" label="WhatsApp settings" />}

      <MemberGroupsProvider groups={memberGroups}>
        <WhatsAppManager
          scheduled={await getScheduledCampaigns(organizationId, "whatsapp")}
          timezone={membership.organization.timezone}
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
