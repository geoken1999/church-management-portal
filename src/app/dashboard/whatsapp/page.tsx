import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getBranches } from "@/lib/branches/dal";
import { getWhatsAppCampaigns, getWhatsAppSendAvailability, getWhatsAppTemplates, getWhatsAppConversations, getWhatsAppConversationMessages } from "@/lib/whatsapp/dal";
import { resolvePhoneCountry } from "@/lib/whatsapp/validation";
import { getWhatsAppConnectionSummary } from "@/lib/whatsapp/credentials";
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

  const [members, branches, campaigns, templates, conversations, availability, connection] = await Promise.all([
    getMembers(organizationId),
    getBranches(organizationId),
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
    </div>
  );
}
