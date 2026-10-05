import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, MapPin, Mail, MessageSquareText, MessageCircle, HardDrive, HandCoins, AlertTriangle } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getTenantUsage } from "@/lib/platform-admin/dal";
import { exportTenantReport } from "@/lib/platform-admin/report-actions";
import { formatBytes } from "@/lib/plans/format";
import { ReportExportButtons } from "@/components/platform-admin/ReportExportButtons";
import { CustomPlanDialog } from "@/components/platform-admin/CustomPlanDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatMoney(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const usage = await getTenantUsage(id);
  return { title: usage ? `${usage.name} | KingdomFlow Super Admin` : "Tenant | KingdomFlow Super Admin" };
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const usage = await getTenantUsage(id);

  if (!usage) {
    notFound();
  }

  const stillTrialing = usage.trialEndsAt ? new Date(usage.trialEndsAt) > new Date() : false;
  const statusLabel = usage.subscriptionStatus === "active" ? "Active" : stillTrialing ? "Trialing" : "Expired";
  const statusVariant = usage.subscriptionStatus === "active" ? "default" : stillTrialing ? "secondary" : "destructive";
  const storagePercent = usage.storageBytesLimit > 0 ? Math.min(100, Math.round((usage.storageBytesUsed / usage.storageBytesLimit) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform-admin/tenants" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Back to tenants
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-3xl font-bold tracking-tight">{usage.name}</h1>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            <Badge variant={usage.customPlanLimits ? "default" : "outline"}>{usage.planName}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            Joined {new Date(usage.createdAt).toLocaleDateString()}
            {usage.country && ` · ${usage.country}`}
            {usage.trialEndsAt && stillTrialing && ` · Trial ends ${new Date(usage.trialEndsAt).toLocaleDateString()}`}
          </p>
          <div className="mt-2">
            <CustomPlanDialog
              organizationId={usage.id}
              effectiveLimits={usage.planLimits}
              customPlanLimits={usage.customPlanLimits}
              hasCustomPlan={usage.customPlanLimits !== null}
            />
          </div>
        </div>
        <ReportExportButtons onExport={exportTenantReport.bind(null, usage.id)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4" />
              <p className="text-xs font-medium">Congregation</p>
            </div>
            <p className="font-heading text-2xl font-bold">{usage.congregationMembers}</p>
            <p className="text-xs text-muted-foreground">
              {usage.leaders} leaders · {usage.youth} youth · {usage.families} families
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4" />
              <p className="text-xs font-medium">Branches</p>
            </div>
            <p className="font-heading text-2xl font-bold">{usage.branches}</p>
            <p className="text-xs text-muted-foreground">{usage.branchCountClaimed ?? "—"} self-reported at onboarding</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4" />
              <p className="text-xs font-medium">Team logins</p>
            </div>
            <p className="font-heading text-2xl font-bold">{usage.teamLogins}</p>
            <p className="text-xs text-muted-foreground">{usage.supportTicketsCount} support tickets raised</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-4" />
              <p className="text-xs font-medium">Emails sent</p>
            </div>
            <p className="font-heading text-xl font-bold">{usage.emailsSentThisMonth} this month</p>
            <p className="text-xs text-muted-foreground">{usage.emailsSentAllTime} all time · {usage.addonEmailCredits} add-on credits</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquareText className="size-4" />
              <p className="text-xs font-medium">SMS sent</p>
            </div>
            <p className="font-heading text-xl font-bold">{usage.smsSentThisMonth} this month</p>
            <p className="text-xs text-muted-foreground">{usage.smsSentAllTime} all time · {usage.addonSmsCredits} add-on credits</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageCircle className="size-4" />
              <p className="text-xs font-medium">WhatsApp sent</p>
            </div>
            <p className="font-heading text-xl font-bold">{usage.whatsappSentThisMonth} this month</p>
            <p className="text-xs text-muted-foreground">{usage.whatsappSentAllTime} all time · {usage.addonWhatsappCredits} add-on credits</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="size-4" />
              <p className="text-xs font-medium">Storage</p>
            </div>
            <p className="font-heading text-xl font-bold">
              {formatBytes(usage.storageBytesUsed)} <span className="text-sm font-normal text-muted-foreground">/ {formatBytes(usage.storageBytesLimit)}</span>
            </p>
            <p className="text-xs text-muted-foreground">{storagePercent}% used · {formatBytes(usage.addonStorageBytes)} add-on</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HandCoins className="size-4" />
              <p className="text-xs font-medium">Giving (all time)</p>
            </div>
            <p className="font-heading text-xl font-bold">{formatMoney(usage.donationsTotalAllTime)}</p>
            <p className="text-xs text-muted-foreground">
              {formatMoney(usage.offeringsTotalAllTime)} offerings · {usage.activeFundraisers} active fundraisers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertTriangle className="size-4" />
              <p className="text-xs font-medium">Delivery failures</p>
            </div>
            <p className="font-heading text-xl font-bold">{usage.deliveryFailuresLast30Days}</p>
            <p className="text-xs text-muted-foreground">Last 30 days, across email/SMS/WhatsApp</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
