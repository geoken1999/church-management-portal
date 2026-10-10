import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getMemberHomeState } from "@/lib/member-home/dal";
import { DesignStudio } from "@/components/mobile/DesignStudio";

export const metadata: Metadata = {
  title: "Design Studio | KingdomFlow",
};

export default async function DesignStudioPage() {
  const membership = await requireOrganization();
  const state = await getMemberHomeState(membership.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Design Studio</h1>
        <p className="mt-1 text-muted-foreground">
          Design what members see on the Home tab of the mobile app. Changes stay in your draft until you publish them.
        </p>
      </div>

      <DesignStudio organizationName={membership.organization.name} logoUrl={membership.organization.logo_url} initial={state} />
    </div>
  );
}
