import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { MobileFeaturesManager } from "@/components/organizations/MobileFeaturesManager";

export const metadata: Metadata = {
  title: "Mobile App | KingdomFlow",
};

export default async function MobileFeaturesPage() {
  const membership = await requireOrganization();

  if (membership.role !== "owner" && membership.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Mobile App</h1>
        <p className="mt-1 text-muted-foreground">
          Choose up to 15 features to make available in KingdomFlow&apos;s mobile app. Everyone on your team sees the same
          set — this isn&apos;t a per-person preference.
        </p>
      </div>

      <MobileFeaturesManager organizationId={membership.organization.id} initialFeatures={membership.organization.mobile_features ?? []} />
    </div>
  );
}
