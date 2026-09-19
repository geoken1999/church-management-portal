import type { Metadata } from "next";
import { Church } from "lucide-react";
import { getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { OverviewStats } from "@/components/dashboard/OverviewStats";
import { MEMBER_COUNT_OPTIONS } from "@/lib/organizations/validation";

export const metadata: Metadata = {
  title: "Dashboard | KingdomFlow",
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const [profile, membership] = await Promise.all([getProfile(), requireOrganization()]);

  const memberCountLabel = MEMBER_COUNT_OPTIONS.find(
    (o) => o.value === membership.organization.member_count_range,
  )?.label;
  const branchCount = membership.organization.branch_count;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {getGreeting()}, {profile?.first_name}
        </h1>
        <p className="mt-1 text-muted-foreground">You are successfully authenticated.</p>
      </div>

      <OverviewStats />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Church className="size-4 text-primary" />
            Church profile
          </CardTitle>
          <CardDescription>{membership.organization.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            {memberCountLabel && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Congregation size</dt>
                <dd className="font-medium">{memberCountLabel}</dd>
              </div>
            )}
            {branchCount != null && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Locations</dt>
                <dd className="font-medium">
                  {branchCount} {branchCount === 1 ? "location" : "locations"}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="font-medium capitalize">{membership.role}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        The Overview stats above are sample data. This dashboard will grow with each future
        module (members, ministries, events, giving, and more).
      </p>
    </div>
  );
}
