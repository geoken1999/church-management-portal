import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getOrganizationSubscription } from "@/lib/billing/dal";
import { isRazorpayConfigured } from "@/lib/billing/env";
import { getOrganizationPayoutDetails } from "@/lib/organizations/payout-details-dal";
import { BillingManager } from "@/components/billing/BillingManager";
import { AddonsManager } from "@/components/billing/AddonsManager";
import { InvoicesCard } from "@/components/billing/InvoicesCard";
import { getCheckoutContext } from "@/lib/billing/checkout-context";
import { getOrganizationInvoices } from "@/lib/invoices/dal";
import { OnboardingCheckoutCard } from "@/components/billing/OnboardingCheckoutCard";
import { getOnboarding } from "@/lib/onboarding/store";
import {
  CREDIT_TYPES,
  ONBOARDING_MODULES,
  creditText,
} from "@/lib/onboarding/config";
import { PayoutDetailsCard } from "@/components/billing/PayoutDetailsCard";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Billing | KingdomFlow",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    addon?: string;
    reason?: string;
    subscription?: string;
  }>;
}) {
  const {
    addon: addonStatus,
    reason: failureReason,
    subscription: subscriptionStatus,
  } = await searchParams;
  await requireUser();
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    redirect("/dashboard");
  }

  const [
    planUsage,
    subscription,
    payoutDetails,
    checkout,
    invoices,
    onboarding,
  ] = await Promise.all([
    getPlanUsage(membership.organization.id),
    getOrganizationSubscription(membership.organization.id),
    getOrganizationPayoutDetails(membership.organization.id),
    getCheckoutContext(membership.organization.id),
    getOrganizationInvoices(membership.organization.id),
    getOnboarding(membership.organization.id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Billing
        </h1>
        <p className="mt-1 text-muted-foreground">
          Manage {membership.organization.name}&apos;s subscription.
        </p>
      </div>

      {addonStatus === "success" && (
        <Alert>
          <AlertDescription>
            Add-on pack purchased — your credits have been topped up.
          </AlertDescription>
        </Alert>
      )}
      {addonStatus === "failed" && (
        <Alert variant="destructive">
          <AlertDescription>
            {failureReason === "unverified"
              ? "That payment couldn't be verified, so nothing was charged on our end — please try again."
              : failureReason === "declined"
                ? "The payment wasn't completed."
                : "Something went wrong finishing that purchase — if you were charged, contact support and we'll sort it out."}
          </AlertDescription>
        </Alert>
      )}
      {subscriptionStatus === "success" && (
        <Alert>
          <AlertDescription>
            Your UPI Autopay mandate was set up successfully — your subscription
            is now active. No charge happens until your first billing cycle.
          </AlertDescription>
        </Alert>
      )}
      {subscriptionStatus === "failed" && (
        <Alert variant="destructive">
          <AlertDescription>
            {failureReason === "unverified"
              ? "That mandate setup couldn't be verified, so nothing was activated — please try again."
              : failureReason === "declined"
                ? "The mandate setup wasn't completed."
                : "Something went wrong finishing that setup — please try again, or contact support if this keeps happening."}
          </AlertDescription>
        </Alert>
      )}

      {planUsage.accessStatus === "trial" &&
        planUsage.trialDaysRemaining !== null && (
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

      {onboarding?.plan_type === "custom" &&
        onboarding.status === "awaiting_payment" &&
        subscription?.status !== "active" && (
          <OnboardingCheckoutCard
            moduleLabels={ONBOARDING_MODULES.filter((m) =>
              onboarding.modules.includes(m.key),
            ).map((m) => m.label)}
            creditLabels={CREDIT_TYPES.filter(
              (t) => onboarding.credits[t.key],
            ).map((t) => creditText(t, onboarding.credits[t.key]!))}
            monthlyBase={onboarding.monthly_base}
            billingDetails={checkout.billingDetails}
            sellerState={checkout.sellerState}
            paymentsConfigured={isRazorpayConfigured()}
          />
        )}

      <BillingManager
        currentPlanId={planUsage.plan.id}
        subscription={subscription}
        paymentsConfigured={isRazorpayConfigured()}
        billingDetails={checkout.billingDetails}
        sellerState={checkout.sellerState}
      />

      <AddonsManager
        billingDetails={checkout.billingDetails}
        sellerState={checkout.sellerState}
        paymentsConfigured={isRazorpayConfigured()}
        balances={{
          sms: planUsage.addonSmsCredits,
          email: planUsage.addonEmailCredits,
          whatsapp: planUsage.addonWhatsappCredits,
          storage: planUsage.addonStorageBytes,
          ai: planUsage.addonAiCredits,
          // K-Connect minutes are bought on the K-Connect page and last only for the month.
          kconnect: 0,
        }}
      />

      <InvoicesCard invoices={invoices} />

      <PayoutDetailsCard
        organizationId={membership.organization.id}
        defaultValues={payoutDetails}
      />
    </div>
  );
}
