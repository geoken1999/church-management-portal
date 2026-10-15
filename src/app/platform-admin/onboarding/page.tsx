import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getAllTenants } from "@/lib/platform-admin/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Onboarding | KingdomFlow Super Admin",
};

export const dynamic = "force-dynamic";

const STATUS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  in_progress: { label: "In progress", variant: "secondary" },
  awaiting_payment: { label: "Awaiting payment", variant: "secondary" },
  active: { label: "Onboarded", variant: "default" },
};

export default async function OnboardingListPage() {
  await requirePlatformAdmin();
  const [tenants, { data: rows }] = await Promise.all([
    getAllTenants(),
    createAdminClient()
      .from("tenant_onboarding")
      .select("organization_id, status, plan_type"),
  ]);
  const statusOf = new Map(
    (rows ?? []).map((r) => [r.organization_id, r.status]),
  );
  const kindOf = new Map(
    (rows ?? []).map((r) => [r.organization_id, r.plan_type]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Onboarding
        </h1>
        <p className="mt-1 text-muted-foreground">
          Take a signed-up tenant through legal documents. Package-plan tenants
          stop there; custom plans continue to modules, credits and
          subscription. Prices and default modules are set on the Modules page.
        </p>
      </div>
      <div className="space-y-3">
        {tenants.map((tenant) => {
          const status = statusOf.get(tenant.id);
          const badge = status ? STATUS[status] : null;
          return (
            <Card key={tenant.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{tenant.name}</span>
                    {badge ? (
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    ) : (
                      <Badge variant="outline">Not started</Badge>
                    )}
                    {kindOf.get(tenant.id) && (
                      <Badge variant="outline">
                        {kindOf.get(tenant.id) === "custom"
                          ? "Custom plan"
                          : "Package plan"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tenant.ownerName ?? "No owner"}{" "}
                    {tenant.ownerEmail && `· ${tenant.ownerEmail}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={`/platform-admin/onboarding/${tenant.id}`} />
                  }
                >
                  {status ? "Open" : "Start onboarding"}
                  <ChevronRight className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
