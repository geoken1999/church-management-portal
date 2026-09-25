import { Gauge } from "lucide-react";
import { getPlanUsage } from "@/lib/plans/dal";
import { formatBytes } from "@/lib/plans/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export async function PlanUsageCard({ organizationId }: { organizationId: string }) {
  const usage = await getPlanUsage(organizationId);

  const emailPercent = Math.min(100, Math.round((usage.emailsSentThisMonth / usage.plan.emailsPerMonth) * 100));
  const smsPercent = Math.min(100, Math.round((usage.smsSentThisMonth / usage.plan.smsPerMonth) * 100));
  const storageCeiling = usage.plan.storageBytes + usage.addonStorageBytes;
  const storagePercent = Math.min(100, Math.round((usage.storageBytesUsed / storageCeiling) * 100));
  const emailExhausted = usage.emailsRemaining <= 0;
  const smsExhausted = usage.smsRemaining <= 0;
  const storageExhausted = usage.storageBytesRemaining <= 0;
  // A send can legitimately push emailsSentThisMonth/smsSentThisMonth past
  // the plan's own monthly figure once add-on credits are covering the
  // overage (see checkEmailQuota/checkSmsQuota in plans/dal.ts) — clamped
  // here so the bar itself never renders past 100%; the exact numbers
  // still show in the text next to it.
  const emailBarValue = Math.min(usage.emailsSentThisMonth, usage.plan.emailsPerMonth);
  const smsBarValue = Math.min(usage.smsSentThisMonth, usage.plan.smsPerMonth);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="size-4 text-primary" />
          Plan usage
          <Badge variant="secondary" className="ml-auto">
            {usage.plan.name}
          </Badge>
        </CardTitle>
        <CardDescription>Shared email/SMS services and file storage, reset with your plan.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Shared emails this month</span>
            <span className={emailExhausted ? "font-medium text-destructive" : "font-medium"}>
              {usage.emailsSentThisMonth.toLocaleString()} / {usage.plan.emailsPerMonth.toLocaleString()}
            </span>
          </div>
          <Progress value={emailBarValue} max={usage.plan.emailsPerMonth}>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
          {usage.addonEmailCredits > 0 && (
            <p className="text-xs text-muted-foreground">+ {usage.addonEmailCredits.toLocaleString()} add-on credits available</p>
          )}
          {emailExhausted && (
            <p className="text-xs text-destructive">
              You&apos;ve used this month&apos;s shared email limit. Your own SMTP is unaffected — buy an add-on pack
              or upgrade your plan for more shared sends.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">SMS this month</span>
            <span className={smsExhausted ? "font-medium text-destructive" : "font-medium"}>
              {usage.smsSentThisMonth.toLocaleString()} / {usage.plan.smsPerMonth.toLocaleString()}
            </span>
          </div>
          <Progress value={smsBarValue} max={usage.plan.smsPerMonth}>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
          {usage.addonSmsCredits > 0 && (
            <p className="text-xs text-muted-foreground">+ {usage.addonSmsCredits.toLocaleString()} add-on credits available</p>
          )}
          {smsExhausted && (
            <p className="text-xs text-destructive">
              You&apos;ve used this month&apos;s SMS limit — buy an add-on pack or upgrade your plan to send more.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Storage used</span>
            <span className={storageExhausted ? "font-medium text-destructive" : "font-medium"}>
              {formatBytes(usage.storageBytesUsed)} / {formatBytes(storageCeiling)}
            </span>
          </div>
          <Progress value={usage.storageBytesUsed} max={storageCeiling}>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
          {usage.addonStorageBytes > 0 && (
            <p className="text-xs text-muted-foreground">Includes +{formatBytes(usage.addonStorageBytes)} from add-on packs</p>
          )}
          {storageExhausted && (
            <p className="text-xs text-destructive">
              You&apos;re out of storage. Buy a storage add-on pack, upgrade your plan, or remove old files (logo,
              worship documents, email images) to free up space.
            </p>
          )}
        </div>

        {(emailPercent >= 90 || smsPercent >= 90 || storagePercent >= 90) && (
          <p className="text-xs text-muted-foreground">
            Need more room? Visit the Email page to raise a ticket, or contact us to upgrade your plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
