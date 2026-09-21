import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMembers } from "@/lib/members/dal";
import { getBranches } from "@/lib/branches/dal";
import { getSmsCampaigns, isSmsAvailable } from "@/lib/sms/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { resolvePhoneCountry } from "@/lib/sms/validation";
import { SmsManager } from "@/components/sms/SmsManager";

export const metadata: Metadata = {
  title: "SMS | KingdomFlow",
};

export default async function SmsPage() {
  const membership = await requireOrganization();
  const canManage = membership.role === "owner" || membership.role === "admin";
  const organizationId = membership.organization.id;
  const orgCountry = membership.organization.country;

  const [members, branches, campaigns, smsAvailable, planUsage] = await Promise.all([
    getMembers(organizationId),
    getBranches(organizationId),
    getSmsCampaigns(organizationId),
    isSmsAvailable(organizationId),
    getPlanUsage(organizationId),
  ]);

  const branchCountryById = new Map(branches.map((branch) => [branch.id, branch.country]));

  const recipientOptions = members
    .filter((member) => member.status === "active" && member.phone)
    .map((member) => ({
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
      phone: member.phone as string,
      branchId: member.branch_id,
      branchName: member.branches?.name ?? null,
      // Branch's own country wins; falls back to the church's country
      // (Church Profile) when the branch has none set or the member has
      // no branch at all.
      countryCode: resolvePhoneCountry(
        member.branch_id ? branchCountryById.get(member.branch_id) : null,
        orgCountry,
      ),
    }));

  const branchOptions = branches.map((branch) => ({ id: branch.id, name: branch.name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">SMS</h1>
        <p className="mt-1 text-muted-foreground">Text message announcements and reminders to your congregation.</p>
      </div>

      <SmsManager
        canManage={canManage}
        smsAvailable={smsAvailable}
        smsRemaining={planUsage.smsRemaining}
        members={recipientOptions}
        branches={branchOptions}
        campaigns={campaigns}
        orgCountryCode={orgCountry}
      />
    </div>
  );
}
