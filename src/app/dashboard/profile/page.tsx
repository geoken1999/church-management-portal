import type { Metadata } from "next";
import Link from "next/link";
import { UserRound, Church, Sparkles, KeyRound } from "lucide-react";
import { requireUser, getProfile } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { MEMBER_COUNT_OPTIONS } from "@/lib/organizations/validation";
import { countryName } from "@/lib/phone/countries";
import { EditProfileForm } from "@/components/profile/EditProfileForm";
import { ChangePasswordForm } from "@/components/profile/ChangePasswordForm";
import { EditOrganizationDetailsForm } from "@/components/organizations/EditOrganizationDetailsForm";

export const metadata: Metadata = {
  title: "Profile | KingdomFlow",
};

export default async function ProfilePage() {
  const user = await requireUser();
  const [profile, membership] = await Promise.all([getProfile(), requireOrganization()]);
  const canManage = membership.role === "owner" || membership.role === "admin";
  const { plan, accessStatus, trialDaysRemaining } = await getPlanUsage(membership.organization.id);

  const memberCountLabel = MEMBER_COUNT_OPTIONS.find(
    (o) => o.value === membership.organization.member_count_range,
  )?.label;
  const branchCount = membership.organization.branch_count;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Profile</h1>
        <p className="mt-1 text-muted-foreground">Your KingdomFlow account details.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-primary" />
              Account
            </CardTitle>
            <CardDescription>Your personal details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{user.email}</dd>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium capitalize">{profile?.status ?? "active"}</dd>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Your role</dt>
                <dd className="font-medium capitalize">{membership.role}</dd>
              </div>
            </dl>
            <Separator />
            <EditProfileForm
              firstName={profile?.first_name ?? ""}
              lastName={profile?.last_name ?? ""}
              phone={profile?.phone ?? ""}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Church className="size-4 text-primary" />
              Church
            </CardTitle>
            <CardDescription>Your organization&apos;s details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Church name</dt>
                <dd className="font-medium">{membership.organization.name}</dd>
              </div>
              {!canManage && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Congregation size</dt>
                    <dd className="font-medium">{memberCountLabel ?? "—"}</dd>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Locations</dt>
                    <dd className="font-medium">
                      {branchCount != null
                        ? `${branchCount} ${branchCount === 1 ? "location" : "locations"}`
                        : "—"}
                    </dd>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Country</dt>
                    <dd className="font-medium">{countryName(membership.organization.country) ?? "—"}</dd>
                  </div>
                </>
              )}
            </dl>
            {canManage && (
              <>
                <Separator />
                <EditOrganizationDetailsForm
                  organizationId={membership.organization.id}
                  memberCountRange={membership.organization.member_count_range}
                  branchCount={membership.organization.branch_count}
                  country={membership.organization.country}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              Password
            </CardTitle>
            <CardDescription>Change your account password</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Plan
            </CardTitle>
            <CardDescription>Your subscription</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium">{plan.name} plan</p>
                <p className="text-muted-foreground">
                  {accessStatus === "trial"
                    ? `Free trial — ${trialDaysRemaining} ${trialDaysRemaining === 1 ? "day" : "days"} left`
                    : plan.priceLabel}
                </p>
              </div>
              <Badge variant="secondary">{accessStatus === "trial" ? "Trial" : plan.name}</Badge>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>{plan.emailsPerMonth.toLocaleString()} shared emails/month</li>
              <li>{plan.smsPerMonth.toLocaleString()} SMS/month</li>
              <li>Up to {plan.maxAdditionalTeamMembers} added team members</li>
              <li>{plan.financeEnabled ? "Finance module included" : "Finance module not included"}</li>
              <li>{plan.socialMediaEnabled ? "Social Media included" : "Social Media not included"}</li>
            </ul>
            {canManage && (
              <Link href="/dashboard/billing" className="text-xs font-medium text-primary hover:underline">
                Manage subscription →
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
