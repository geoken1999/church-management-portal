import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getInstagramDashboardData } from "@/lib/instagram/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { InstagramMessagesPopupClient } from "@/components/instagram/InstagramMessagesPopupClient";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { UpgradeRequired } from "@/components/dashboard/UpgradeRequired";

export const metadata: Metadata = {
  title: "Instagram Messages | KingdomFlow",
};

// A standalone popup window for the full Instagram Messages experience
// (conversation list + thread, everything), opened via window.open() from
// the embedded Messages tab on /dashboard/instagram. Deliberately placed
// outside /dashboard so it doesn't inherit the dashboard layout's
// sidebar/nav chrome — that would eat most of a modestly-sized popup
// window for navigation nobody needs once it's already open.
export default async function InstagramMessagesPopupPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const { plan } = await getPlanUsage(organizationId);
  if (!plan.socialMediaEnabled) {
    return <UpgradeRequired label="Instagram" plan={plan.name} />;
  }
  if (!membership.tabAccess.instagram.read) {
    return <AccessRestricted label="Instagram" />;
  }

  const data = await getInstagramDashboardData(organizationId);

  return <InstagramMessagesPopupClient organizationId={organizationId} data={data} />;
}
