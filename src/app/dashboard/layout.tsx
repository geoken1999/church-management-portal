import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { MENU_COOKIE, parseMenuPrefs } from "@/lib/menu-prefs";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization, getUserOrganizations } from "@/lib/organizations/dal";
import { getNotifications } from "@/lib/notifications/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getOrganizationSubscription } from "@/lib/billing/dal";
import { isPayUConfigured } from "@/lib/payu/env";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TrialExpiredScreen } from "@/components/billing/TrialExpiredScreen";
import { toAppLocale } from "@/lib/i18n/config";
import { getFeatureTags } from "@/lib/platform-admin/feature-flags";
import { getCheckoutContext } from "@/lib/billing/checkout-context";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireUser();
  const menuPrefs = parseMenuPrefs((await cookies()).get(MENU_COOKIE)?.value);
  const [membership, memberships, profile] = await Promise.all([
    requireOrganization(),
    getUserOrganizations(),
    getProfile(),
  ]);
  const canManage = membership.role === "owner" || membership.role === "admin";
  const [notifications, planUsage, featureTags] = await Promise.all([
    getNotifications(membership.organization.id),
    getPlanUsage(membership.organization.id),
    getFeatureTags(),
  ]);

  if (planUsage.accessStatus === "expired") {
    const subscription = await getOrganizationSubscription(membership.organization.id);
    const checkout = await getCheckoutContext(membership.organization.id);
    return (
      <TrialExpiredScreen
        organizationName={membership.organization.name}
        canManage={canManage}
        currentPlanId={planUsage.plan.id}
        subscription={subscription}
        payuConfigured={isPayUConfigured()}
        billingDetails={checkout.billingDetails}
        sellerState={checkout.sellerState}
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
      featureTags={featureTags}
      planFeatures={{ finance: planUsage.plan.financeEnabled, socialMedia: planUsage.plan.socialMediaEnabled }}
      creditBalances={{
        sms: {
          planRemaining: Math.max(0, planUsage.plan.smsPerMonth - planUsage.smsSentThisMonth),
          planLimit: planUsage.plan.smsPerMonth,
          addon: planUsage.addonSmsCredits,
        },
        ai: {
          planRemaining: Math.max(0, planUsage.plan.aiRepliesPerMonth - planUsage.aiRepliesSentThisMonth),
          planLimit: planUsage.plan.aiRepliesPerMonth,
          addon: planUsage.addonAiCredits,
        },
        email: {
          planRemaining: Math.max(0, planUsage.plan.emailsPerMonth - planUsage.emailsSentThisMonth),
          planLimit: planUsage.plan.emailsPerMonth,
          addon: planUsage.addonEmailCredits,
        },
      }}
      trialDaysRemaining={planUsage.trialDaysRemaining}
      initialLocale={toAppLocale(profile?.locale)}
      initialMenuPrefs={menuPrefs}
    >
      {children}
    </DashboardShell>
  );
}
