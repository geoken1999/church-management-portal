import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getOrganizationSubscription } from "@/lib/billing/dal";
import { isRazorpayConfigured } from "@/lib/billing/env";
import { BillingManager } from "@/components/billing/BillingManager";
import { AddonsManager } from "@/components/billing/AddonsManager";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Billing | KingdomFlow",
};

export default async function BillingPage() {
  const user = await requireUser();
  const [profile, membership] = await Promise.all([getProfile(), requireOrganization()]);

  if (membership.role !== "owner" && membership.role !== "admin") {
    redirect("/dashboard");
  }

  const [planUsage, subscription] = await Promise.all([
    getPlanUsage(membership.organization.id),
    getOrganizationSubscription(membership.organization.id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-muted-foreground">Manage {membership.organization.name}&apos;s subscription.</p>
      </div>

      {planUsage.accessStatus === "trial" && planUsage.trialDaysRemaining !== null && (
        <Alert>
          <AlertDescription>
            You&apos;re on a free trial —{" "}
            {planUsage.trialDaysRemaining <= 0
              ? "it ends today."
              : `${planUsage.trialDaysRemaining} ${planUsage.trialDaysRemaining === 1 ? "day" : "days"} left.`}{" "}
            Subscribe below to keep access afterward.
          </AlertDescription>
        </Alert>
      )}

      <BillingManager
        currentPlanId={planUsage.plan.id}
        subscription={subscription}
        razorpayConfigured={isRazorpayConfigured()}
        prefill={{
          name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : membership.organization.name,
          email: user.email ?? "",
          contact: profile?.phone ?? "",
        }}
      />

      <AddonsManager
        razorpayConfigured={isRazorpayConfigured()}
        prefill={{
          name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : membership.organization.name,
          email: user.email ?? "",
          contact: profile?.phone ?? "",
        }}
        balances={{
          sms: planUsage.addonSmsCredits,
          email: planUsage.addonEmailCredits,
          whatsapp: planUsage.addonWhatsappCredits,
          storage: planUsage.addonStorageBytes,
        }}
      />
    </div>
  );
}
