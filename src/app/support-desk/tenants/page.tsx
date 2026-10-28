import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireSupportAccess } from "@/lib/support-staff/access";
import { getAllTenants } from "@/lib/platform-admin/dal";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Churches | KingdomFlow Support" };
export const dynamic = "force-dynamic";

export default async function SupportTenantsPage() {
  await requireSupportAccess();
  const tenants = await getAllTenants();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Churches</h1>
        <p className="mt-1 text-muted-foreground">Read-only. {tenants.length} churches.</p>
      </div>
      <div className="space-y-2">
        {tenants.map((tenant) => {
          const trialing = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) > new Date() : false;
          const status = tenant.subscriptionStatus === "active" ? "Active" : trialing ? "Trialing" : "Expired";
          return (
            <Link key={tenant.id} href={`/support-desk/tenants/${tenant.id}`}>
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{tenant.name}</span>
                      <Badge variant={status === "Expired" ? "destructive" : "secondary"}>{status}</Badge>
                      <Badge variant="outline">{tenant.planName}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tenant.ownerName ?? "No owner"} {tenant.ownerEmail && `· ${tenant.ownerEmail}`}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
