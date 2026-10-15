import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getModulePricing } from "@/lib/onboarding/store";
import { ModulePricingPanel } from "@/components/platform-admin/ModulePricingPanel";

export const metadata: Metadata = {
  title: "Modules & Pricing | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

export default async function ModulesPricingPage() {
  await requirePlatformAdmin();
  const pricing = await getModulePricing();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Modules &amp; pricing
        </h1>
        <p className="mt-1 text-muted-foreground">
          What each module costs per month (before 18% GST), and which modules
          start ticked when you onboard a tenant. A tenant is billed the total
          of the modules chosen for them. Prices here apply to onboardings you
          send from now on.
        </p>
      </div>
      <ModulePricingPanel initial={pricing} />
    </div>
  );
}
