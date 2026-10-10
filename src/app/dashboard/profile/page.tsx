import type { Metadata } from "next";
import Link from "next/link";
import { UserRound, Church, Sparkles, KeyRound, QrCode } from "lucide-react";
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
import { QrLogoUpload } from "@/components/organizations/QrLogoUpload";
import { getSiteUrl } from "@/lib/site-url";
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
                  timezone={membership.organization.timezone}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="size-4 text-primary" />
              QR code logo
            </CardTitle>
            <CardDescription>Put your church&apos;s mark in the middle of every QR code</CardDescription>
          </CardHeader>
          <CardContent>
            <QrLogoUpload
              organizationId={membership.organization.id}
              qrLogoUrl={membership.organization.qr_logo_url ?? null}
              qrLogoSize={membership.organization.qr_logo_size ?? 20}
              sampleLink={`${getSiteUrl()}/join/${membership.organization.slug}`}
            />
          </CardContent>
        </Card>
      )}

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
              <li>
                Up to {plan.maxAdditionalAdmins} added admin{plan.maxAdditionalAdmins === 1 ? "" : "s"} and{" "}
                {plan.maxAdditionalStaff} added staff
              </li>
              <li>{plan.branchLimit === null ? "Unlimited branches" : `Up to ${plan.branchLimit} branches`}</li>
              <li>{plan.memberLimit === null ? "Unlimited members" : `Up to ${plan.memberLimit.toLocaleString()} members`}</li>
              <li>{plan.formsLimit === null ? "Unlimited forms" : `Up to ${plan.formsLimit} forms`}</li>
              <li>
                {plan.financeEnabled
                  ? plan.ownPaymentGatewayEnabled
                    ? "Finance module included (own or shared gateway)"
                    : "Finance module included (shared gateway only)"
                  : "Finance module not included"}
              </li>
              <li>{plan.socialMediaEnabled ? "Social Media included" : "Social Media not included"}</li>
              <li>
                {plan.automationLimit === 0
                  ? "Automation not included"
                  : plan.automationLimit === null
                    ? "Unlimited automations"
                    : `Up to ${plan.automationLimit} automations`}
              </li>
              <li>Support SLA: {plan.supportSlaDays} working day{plan.supportSlaDays === 1 ? "" : "s"}</li>
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
