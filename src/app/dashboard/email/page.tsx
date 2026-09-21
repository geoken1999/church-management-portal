import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getBranches } from "@/lib/branches/dal";
import { getEmailCampaigns, getEmailSmtpSummary, isEmailAvailable, getLatestEmailSetupRequest } from "@/lib/email/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { EmailManager } from "@/components/email/EmailManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Email | KingdomFlow",
};

export default async function EmailPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.email.read) {
    return <AccessRestricted label="Email" />;
  }

  const [members, branches, campaigns, smtpSummary, emailAvailable, setupRequest, planUsage] = await Promise.all([
    getMembers(organizationId),
    getBranches(organizationId),
    getEmailCampaigns(organizationId),
    getEmailSmtpSummary(organizationId),
    isEmailAvailable(organizationId),
    getLatestEmailSetupRequest(organizationId),
    getPlanUsage(organizationId),
  ]);

  // Quota only bites when relying on the shared provider — an org's own
  // SMTP is unmetered, so it's never the reason the composer is offline.
  const quotaExhausted = !smtpSummary && planUsage.emailsRemaining <= 0;

  const recipientOptions = members
    .filter((member) => member.status === "active" && member.email)
    .map((member) => ({
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
      email: member.email as string,
      branchId: member.branch_id,
      branchName: member.branches?.name ?? null,
    }));

  const branchOptions = branches.map((branch) => ({ id: branch.id, name: branch.name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Email</h1>
        <p className="mt-1 text-muted-foreground">Send newsletters and announcements to your congregation.</p>
      </div>

      <EmailManager
        canManage={canManage}
        canSend={membership.tabAccess.email.write}
        emailAvailable={emailAvailable}
        quotaExhausted={quotaExhausted}
        emailsRemaining={planUsage.emailsRemaining}
        smtpSummary={smtpSummary}
        setupRequestOpen={setupRequest?.status === "open"}
        members={recipientOptions}
        branches={branchOptions}
        campaigns={campaigns}
      />
    </div>
  );
}
