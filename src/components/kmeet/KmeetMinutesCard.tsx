"use client";

import { Clock } from "lucide-react";
import { PackCard } from "@/components/billing/AddonsManager";
import { ADDON_PACKS } from "@/lib/plans/config";
import { minutesLabel } from "@/lib/kmeet/minutes";
import type { KmeetMinutes } from "@/lib/kmeet/minutes-service";
import type { BillingDetailsInput } from "@/lib/billing/billing-details";
import { Card, CardContent } from "@/components/ui/card";

function Meter({
  label,
  allowance,
  used,
}: {
  label: string;
  allowance: number | null;
  used: number;
}) {
  const percent = allowance
    ? Math.min(100, Math.round((used / allowance) * 100))
    : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {allowance === null
            ? `${minutesLabel(used)} used, unlimited`
            : `${minutesLabel(Math.min(used, allowance))} of ${minutesLabel(allowance)} used`}
        </span>
      </div>
      {allowance !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${percent >= 90 ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

// This month's K-Connect minutes: the video and audio pools of the plan, any minutes bought on top, and a way
// to buy more. Live classes use the same minutes; live streams do not.
export function KmeetMinutesCard({
  minutes,
  canBuy,
  paymentsConfigured,
  billingDetails,
  sellerState,
  justBought,
}: {
  minutes: KmeetMinutes;
  canBuy: boolean;
  paymentsConfigured: boolean;
  billingDetails: BillingDetailsInput;
  sellerState: string;
  justBought?: boolean;
}) {
  const pack = ADDON_PACKS.find((p) => p.addonType === "kconnect");
  const unlimited =
    minutes.video.allowance === null && minutes.audio.allowance === null;
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-primary" />
          <p className="font-medium">K-Connect minutes this month</p>
        </div>
        {justBought && (
          <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
            Payment received. Your extra minutes are ready to use.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Meter
            label="Video"
            allowance={minutes.video.allowance}
            used={minutes.video.used}
          />
          <Meter
            label="Audio"
            allowance={minutes.audio.allowance}
            used={minutes.audio.used}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Meetings and Bible School live classes use these minutes, which start
          again at the beginning of each month. Live streams don&apos;t use them.
          {minutes.extraBought > 0
            ? ` You also bought ${minutesLabel(minutes.extraBought)} this month, used once your plan minutes run out (${minutesLabel(minutes.extraLeft)} left); they end with the month.`
            : ""}
        </p>
        {!unlimited && pack && canBuy && (
          <div className="max-w-sm">
            <PackCard
              pack={pack}
              paymentsConfigured={paymentsConfigured}
              billingDetails={billingDetails}
              sellerState={sellerState}
            />
          </div>
        )}
        {!unlimited && pack && !canBuy && (
          <p className="text-xs text-muted-foreground">
            Need more minutes? Ask an owner or admin to buy a {pack.label} pack
            here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
