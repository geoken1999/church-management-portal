import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getBranches } from "@/lib/branches/dal";
import {
  getWhatsAppAccount,
  getWhatsAppCampaigns,
  getWhatsAppSendAvailability,
  getWhatsAppConversations,
  getWhatsAppConversationMessages,
} from "@/lib/whatsapp/dal";
import { resolvePhoneCountry } from "@/lib/whatsapp/validation";
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

  const [members, branches, account, campaigns, conversations] = await Promise.all([
    getMembers(organizationId),
    getBranches(organizationId),
    getWhatsAppAccount(organizationId),
    getWhatsAppCampaigns(organizationId),
    getWhatsAppConversations(organizationId),
  ]);

  const hasOwnAccount = Boolean(account);
  const availability = await getWhatsAppSendAvailability(organizationId, hasOwnAccount);

  // Chat is 'own'-mode only (see migration 0058) — no conversations exist
  // for orgs without a connected account, so this only fetches messages
  // when there's actually something to show.
  const conversationsWithMessages = hasOwnAccount
    ? await Promise.all(
        conversations.map(async (conversation) => ({
          ...conversation,
          messages: await getWhatsAppConversationMessages(organizationId, conversation.id),
        })),
      )
    : [];

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

      <WhatsAppManager
        organizationId={organizationId}
        canSend={membership.tabAccess.whatsapp.write}
        isOrgAdmin={isOrgAdmin}
        hasOwnAccount={hasOwnAccount}
        ownWhatsAppNumber={account?.whatsapp_number ?? null}
        sharedAvailable={availability.sharedAvailable}
        ownAvailable={availability.ownAvailable}
        whatsappRemaining={availability.whatsappRemaining}
        members={recipientOptions}
        branches={branchOptions}
        campaigns={campaigns}
        conversations={conversationsWithMessages}
        orgCountryCode={orgCountry}
      />
    </div>
  );
}
