import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getModulePricing } from "@/lib/onboarding/store";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
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
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Price sheet (PDF)</p>
          <p className="text-sm text-muted-foreground">
            The plans, these module prices, the block prices of a custom package
            and the add-on packs, ready to share. It always uses the prices
            saved on this page.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={
            <a href="/api/platform-admin/pricing-pdf" download>
              <FileDown className="size-4" /> Download PDF
            </a>
          }
        />
      </div>
      <ModulePricingPanel initial={pricing} />
    </div>
  );
}
