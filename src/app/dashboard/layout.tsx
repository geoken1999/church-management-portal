import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { MENU_COOKIE, parseMenuPrefs } from "@/lib/menu-prefs";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization, getUserOrganizations } from "@/lib/organizations/dal";
import { getNotifications } from "@/lib/notifications/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getOrganizationSubscription } from "@/lib/billing/dal";
import { isRazorpayConfigured } from "@/lib/billing/env";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TrialExpiredScreen } from "@/components/billing/TrialExpiredScreen";
import { toAppLocale } from "@/lib/i18n/config";
import { getFeatureTags } from "@/lib/platform-admin/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProofBanner } from "@/components/organizations/ProofBanner";
import { proofDeadline, statusOf } from "@/lib/organizations/proof";
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
  // The 2 minutes for the registration document start the first time the church opens the dashboard.
  const proofOrg = membership.organization;
  const proofStatus = statusOf(proofOrg.verification_status);
  let proofStartedAt = proofOrg.verification_started_at ?? null;
  if (proofStatus === "not_submitted" && !proofStartedAt) {
    proofStartedAt = new Date().toISOString();
    await createAdminClient()
      .from("organizations")
      .update({ verification_started_at: proofStartedAt })
      .eq("id", proofOrg.id)
      .is("verification_started_at", null);
  }
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
        paymentsConfigured={isRazorpayConfigured()}
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
      lockedTabs={membership.lockedTabs}
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
      {proofStatus !== "verified" && (
        <ProofBanner
          status={proofStatus}
          deadlineAt={proofStartedAt ? proofDeadline(proofStartedAt) : null}
          serverNow={new Date().toISOString()}
          canManage={canManage}
        />
      )}
      {children}
    </DashboardShell>
  );
}
