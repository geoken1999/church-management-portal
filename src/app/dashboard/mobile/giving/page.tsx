import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getGivingConfig } from "@/lib/finance/giving-config";
import { GivingSettingsPanel } from "@/components/mobile/GivingSettingsPanel";
import { GatewayAccountsCard } from "@/components/finance/GatewayAccountsCard";

export const metadata: Metadata = {
  title: "Online Giving | KingdomFlow",
};

export default async function MobileGivingPage() {
  const membership = await requireOrganization();
  const config = await getGivingConfig(membership.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Online giving</h1>
        <p className="mt-1 text-muted-foreground">
          Let members give offering, tithe and donations from the mobile app (Profile &gt; Give online), and choose which payment gateway collects the gifts.
          Active fundraisers with a payment link appear there too. You can change this from the mobile app as well (Settings &gt; Configuration).
        </p>
      </div>
      <GivingSettingsPanel config={config} />
      {config.ownGatewayAvailable && config.financeAvailable && <GatewayAccountsCard connected={config.connected} active={config.ownGateway} />}
    </div>
  );
}
