import type { ReactNode } from "react";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization, getUserOrganizations } from "@/lib/organizations/dal";
import { getNotifications } from "@/lib/notifications/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getOrganizationSubscription } from "@/lib/billing/dal";
import { isRazorpayConfigured } from "@/lib/billing/env";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TrialExpiredScreen } from "@/components/billing/TrialExpiredScreen";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [membership, memberships, profile] = await Promise.all([
    requireOrganization(),
    getUserOrganizations(),
    getProfile(),
  ]);
  const canManage = membership.role === "owner" || membership.role === "admin";
  const [notifications, planUsage] = await Promise.all([
    getNotifications(membership.organization.id),
    getPlanUsage(membership.organization.id),
  ]);

  if (planUsage.accessStatus === "expired") {
    const subscription = await getOrganizationSubscription(membership.organization.id);
    return (
      <TrialExpiredScreen
        organizationName={membership.organization.name}
        canManage={canManage}
        currentPlanId={planUsage.plan.id}
        subscription={subscription}
        razorpayConfigured={isRazorpayConfigured()}
        prefill={{
          name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : membership.organization.name,
          email: user.email ?? "",
          contact: profile?.phone ?? "",
        }}
      />
    );
  }

  return (
    <DashboardShell
      organization={membership.organization}
      canManage={canManage}
      memberships={memberships}
      notifications={notifications}
      tabAccess={membership.tabAccess}
      planFeatures={{ finance: planUsage.plan.financeEnabled, socialMedia: planUsage.plan.socialMediaEnabled }}
      trialDaysRemaining={planUsage.trialDaysRemaining}
    >
      {children}
    </DashboardShell>
  );
}
