"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelModuleSubscription, keepModuleSubscription } from "@/lib/billing/module-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface ModuleSubscriptionRow {
  moduleKey: string;
  label: string;
  status: string;
  chargeText: string;
  /** Formatted date the module ends or renews on. */
  dateText: string | null;
  cancelAtPeriodEnd: boolean;
}

// The modules a church has added on top of its plan: what each costs and a way to stop or resume it.
export function ModuleSubscriptionsCard({ rows }: { rows: ModuleSubscriptionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (key: string) => Promise<{ error?: string }>, key: string) {
    setError(null);
    startTransition(async () => {
      const result = await action(key);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add-on modules</CardTitle>
        <CardDescription>Modules you&apos;ve unlocked on their own, billed monthly on top of your plan.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.moduleKey} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
            <div>
              <p className="font-medium">{row.label}</p>
              <p className="text-muted-foreground">
                {row.chargeText}
                {row.dateText && (row.cancelAtPeriodEnd ? ` · ends ${row.dateText}` : ` · renews ${row.dateText}`)}
              </p>
            </div>
            {row.cancelAtPeriodEnd ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(keepModuleSubscription, row.moduleKey)}>
                Keep it
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(cancelModuleSubscription, row.moduleKey)}>
                Cancel
              </Button>
            )}
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
