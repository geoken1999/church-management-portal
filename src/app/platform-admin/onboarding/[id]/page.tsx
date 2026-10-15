import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getModulePricing,
  getOnboarding,
  getOnboardingDocuments,
} from "@/lib/onboarding/store";
import { OnboardingWizard } from "@/components/platform-admin/OnboardingWizard";

export const metadata: Metadata = {
  title: "Onboarding | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { data: org } = await createAdminClient()
    .from("organizations")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();
  const [onboarding, documents, pricing] = await Promise.all([
    getOnboarding(id),
    getOnboardingDocuments(id),
    getModulePricing(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/platform-admin/onboarding"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All tenants
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">
          Onboard {org.name}
        </h1>
      </div>
      <OnboardingWizard
        organizationId={org.id}
        onboarding={onboarding}
        documents={documents}
        prices={Object.fromEntries(
          Object.entries(pricing).map(([k, v]) => [k, v.monthly_price]),
        )}
      />
    </div>
  );
}
