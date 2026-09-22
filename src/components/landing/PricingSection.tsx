"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTab, TabsIndicator } from "@/components/ui/tabs";

type BillingInterval = "monthly" | "yearly";

// Marketing-page pricing preview only — deliberately not wired to
// src/lib/plans/config.ts (the actual plan/feature/Razorpay config that
// drives the app). Naming, prices, and feature sets here are still
// settling; the real config gets updated separately once they're final.
const LANDING_PLANS = [
  { id: "starter", name: "Starter", monthly: 499, yearly: 4990, description: "For small churches getting started." },
  { id: "growth", name: "Growth", monthly: 1499, yearly: 14990, description: "For growing churches expanding their ministry." },
  { id: "pro", name: "Pro", monthly: 3999, yearly: 39990, description: "For large, multi-branch churches." },
] as const;

const FEATURED_PLAN_ID = "growth";

function priceLabel(amount: number, interval: BillingInterval): string {
  return `₹${amount.toLocaleString("en-IN")}/${interval === "monthly" ? "month" : "year"}`;
}

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
            <TabsTab value="yearly">
              Yearly
              <Badge variant="secondary" className="ml-1.5">
                Save 17%
              </Badge>
            </TabsTab>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {LANDING_PLANS.map((plan) => {
          const featured = plan.id === FEATURED_PLAN_ID;
          const amount = billingInterval === "monthly" ? plan.monthly : plan.yearly;
          return (
            <Card key={plan.id} className={featured ? "border-primary shadow-lg" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {featured && <Badge>Most popular</Badge>}
                </div>
                <p className="font-heading text-3xl font-bold">{priceLabel(amount, billingInterval)}</p>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Full feature breakdown coming soon.</p>
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
