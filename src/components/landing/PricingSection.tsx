"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X, Sparkles } from "lucide-react";
import { PLANS, priceForInterval, type BillingInterval } from "@/lib/plans/config";
import { PLAN_ORDER, planFeatureRows, planDescription } from "@/lib/plans/display";
import { CustomPlanRequestDialog } from "@/components/landing/CustomPlanRequestDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTab, TabsIndicator } from "@/components/ui/tabs";

// Shown alongside Starter/Growth/Pro, but entirely outside the real
// plan config — "completely manual": no PlanId, no price, no limits, no
// Razorpay plan. Raising a request just emails the team directly (see
// src/lib/custom-plan/actions.ts); whatever this account ends up on is
// then set by hand, same mechanism as comping a plan from Platform Admin.
const CUSTOM_PLAN_HIGHLIGHTS = [
  "Tailored limits for your church's size and needs",
  "Dedicated onboarding and setup support",
  "A plan we work out together, not a fixed tier",
];

const FEATURED_PLAN_ID = "premium";

// Wired directly to src/lib/plans/config.ts (the actual plan/feature/
// Razorpay config that drives the app) via the same planFeatureRows/
// planDescription helpers src/components/billing/BillingManager.tsx
// already uses — one source of truth, so a future price or limit change
// never has to be made in two places.
export function PricingSection() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  return (
    <>
      <div className="mb-8 flex justify-center">
        <Tabs value={billingInterval} onValueChange={(v) => setBillingInterval((v as BillingInterval) ?? "monthly")}>
          <TabsList>
            <TabsIndicator />
            <TabsTab value="monthly">Monthly</TabsTab>
            <TabsTab value="annual">
              Yearly
              <Badge variant="secondary" className="ml-1.5">
                Save 17%
              </Badge>
            </TabsTab>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const featured = planId === FEATURED_PLAN_ID;
          const price = priceForInterval(plan, billingInterval);
          return (
            <Card key={planId} className={featured ? "border-primary shadow-lg" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {featured && <Badge>Most popular</Badge>}
                </div>
                <p className="font-heading text-3xl font-bold">{price.label}</p>
                <CardDescription>{planDescription(planId)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5 text-sm">
                  {planFeatureRows(plan).map((row) => (
                    <li key={row.label} className="flex items-start gap-2">
                      {row.included ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      ) : (
                        <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
                      )}
                      <span className={row.included ? "" : "text-muted-foreground/60"}>{row.label}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={featured ? "default" : "outline"}
                  nativeButton={false}
                  render={<Link href="/login">Get Started</Link>}
                />
              </CardContent>
            </Card>
          );
        })}

      </div>

      <Card className="mt-6 overflow-hidden border-primary/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <CardContent className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div>
              <p className="font-heading text-lg font-bold">Need something custom?</p>
              <p className="mt-1 text-sm text-muted-foreground">For churches that need something outside the standard plans.</p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {CUSTOM_PLAN_HIGHLIGHTS.map((highlight) => (
                  <li key={highlight} className="flex items-center gap-1.5">
                    <Check className="size-3.5 shrink-0 text-primary" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <CustomPlanRequestDialog triggerLabel="Request a Custom plan" triggerClassName="shrink-0" />
        </CardContent>
      </Card>
    </>
  );
}
