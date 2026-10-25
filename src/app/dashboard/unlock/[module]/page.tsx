import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { isRazorpayConfigured } from "@/lib/billing/env";
import { getCheckoutContext } from "@/lib/billing/checkout-context";
import { getModuleOffer } from "@/lib/billing/modules";
import { UnlockModuleCard } from "@/components/billing/UnlockModuleCard";
import { isPlanId, resolveTabStates, type CustomPlanOverrides } from "@/lib/plans/config";
import { TAB_LABELS } from "@/lib/permissions/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Unlock a module | KingdomFlow" };
export const dynamic = "force-dynamic";

// The page a locked menu item opens: the module's price on its own and the way to subscribe to it.
export default async function UnlockModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: moduleKey } = await params;
  const membership = await requireOrganization();
  const offer = await getModuleOffer(moduleKey);
  if (!offer) notFound();

  const organization = membership.organization;
  const planId = organization.plan && isPlanId(organization.plan) ? organization.plan : "basic";
  const tabs = resolveTabStates(planId, (organization.custom_plan_limits ?? null) as CustomPlanOverrides | null, organization.addon_modules);
  const unlocked = offer.tabs.every((tab) => tabs[tab as keyof typeof tabs]);

  if (unlocked) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-10 text-primary" />
          <p className="font-heading text-lg font-bold">{offer.label.replace(/\s*\(.*\)\s*$/, "")} is already part of your church</p>
          <p className="text-sm text-muted-foreground">Find it in the menu. If you&apos;ve just subscribed, it may take a moment to appear.</p>
          <Button nativeButton={false} render={<Link href="/dashboard" />}>
            Back to the dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  const [planUsage, checkout] = await Promise.all([getPlanUsage(organization.id), getCheckoutContext(organization.id)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{offer.label.replace(/\s*\(.*\)\s*$/, "")}</h1>
        <p className="mt-1 text-muted-foreground">Not in your current plan.</p>
      </div>
      <UnlockModuleCard
        moduleKey={moduleKey}
        label={offer.label}
        planName={planUsage.plan.name}
        includes={offer.tabs.map((tab) => TAB_LABELS[tab as keyof typeof TAB_LABELS])}
        monthlyBase={offer.price}
        canSubscribe={membership.role === "owner" || membership.role === "admin"}
        billingDetails={checkout.billingDetails}
        sellerState={checkout.sellerState}
        paymentsConfigured={isRazorpayConfigured()}
      />
    </div>
  );
}
