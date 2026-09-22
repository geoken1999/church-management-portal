"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTab, TabsIndicator } from "@/components/ui/tabs";
import { PLANS, priceForInterval, type BillingInterval } from "@/lib/plans/config";
import { PLAN_ORDER, planFeatureRows, planDescription } from "@/lib/plans/display";

// A small client island within the otherwise server-rendered landing page
// — only this toggle needs interactivity, so the rest of the page stays a
// Server Component.
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
              Annual
              <Badge variant="secondary" className="ml-1.5">
                Save 10%
              </Badge>
            </TabsTab>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const price = priceForInterval(plan, billingInterval);
          const featured = planId === "premium";
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
    </>
  );
}
