import { Gauge } from "lucide-react";
import { getPlanUsage } from "@/lib/plans/dal";
import { formatBytes } from "@/lib/plans/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export async function PlanUsageCard({ organizationId }: { organizationId: string }) {
  const usage = await getPlanUsage(organizationId);

  const emailPercent = Math.min(100, Math.round((usage.emailsSentThisMonth / usage.plan.emailsPerMonth) * 100));
  const storagePercent = Math.min(100, Math.round((usage.storageBytesUsed / usage.plan.storageBytes) * 100));
  const emailExhausted = usage.emailsRemaining <= 0;
  const storageExhausted = usage.storageBytesRemaining <= 0;

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
        <CardDescription>Shared email service and file storage, reset with your plan.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Shared emails this month</span>
            <span className={emailExhausted ? "font-medium text-destructive" : "font-medium"}>
              {usage.emailsSentThisMonth.toLocaleString()} / {usage.plan.emailsPerMonth.toLocaleString()}
            </span>
          </div>
          <Progress value={usage.emailsSentThisMonth} max={usage.plan.emailsPerMonth}>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
          {emailExhausted && (
            <p className="text-xs text-destructive">
              You&apos;ve used this month&apos;s shared email limit. Your own SMTP is unaffected — upgrade your plan
              for more shared sends.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Storage used</span>
            <span className={storageExhausted ? "font-medium text-destructive" : "font-medium"}>
              {formatBytes(usage.storageBytesUsed)} / {formatBytes(usage.plan.storageBytes)}
            </span>
          </div>
          <Progress value={usage.storageBytesUsed} max={usage.plan.storageBytes}>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
          {storageExhausted && (
            <p className="text-xs text-destructive">
              You&apos;re out of storage. Upgrade your plan or remove old files (logo, worship documents, email
              images) to free up space.
            </p>
          )}
        </div>

        {(emailPercent >= 90 || storagePercent >= 90) && (
          <p className="text-xs text-muted-foreground">
            Need more room? Visit the Email page to raise a ticket, or contact us to upgrade your plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
