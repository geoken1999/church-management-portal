"use client";

import { useState, useTransition } from "react";
import { saveModulePricingAction } from "@/lib/onboarding/actions";
import { ONBOARDING_MODULES } from "@/lib/onboarding/config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorToast } from "@/components/ui/error-toast";

export function ModulePricingPanel({
  initial,
}: {
  initial: Record<string, { monthly_price: number; is_default: boolean }>;
}) {
  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      ONBOARDING_MODULES.map((m) => [
        m.key,
        {
          price: String(initial[m.key]?.monthly_price ?? 0),
          isDefault: initial[m.key]?.is_default ?? false,
        },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveModulePricingAction(
        ONBOARDING_MODULES.map((m) => ({
          key: m.key,
          price: Number(rows[m.key].price) || 0,
          isDefault: rows[m.key].isDefault,
        })),
      );
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <ErrorToast message={error} />
      <Card className="overflow-hidden py-0">
        <div className="grid grid-cols-[1fr_auto_140px] items-center gap-3 border-b border-border px-4 py-2 text-xs uppercase text-muted-foreground">
          <span>Module</span>
          <span>Default</span>
          <span>₹ per month</span>
        </div>
        <div className="divide-y divide-border">
          {ONBOARDING_MODULES.map((m) => (
            <div
              key={m.key}
              className="grid grid-cols-[1fr_auto_140px] items-center gap-3 px-4 py-2.5"
            >
              <span className="text-sm font-medium">{m.label}</span>
              <input
                type="checkbox"
                aria-label={`${m.label} is a default module`}
                checked={rows[m.key].isDefault}
                onChange={(e) => {
                  setSaved(false);
                  setRows((r) => ({
                    ...r,
                    [m.key]: { ...r[m.key], isDefault: e.target.checked },
                  }));
                }}
              />
              <Input
                type="number"
                min={0}
                step="1"
                aria-label={`${m.label} price per month`}
                value={rows[m.key].price}
                onChange={(e) => {
                  setSaved(false);
                  setRows((r) => ({
                    ...r,
                    [m.key]: { ...r[m.key], price: e.target.value },
                  }));
                }}
              />
            </div>
          ))}
        </div>
      </Card>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving..." : "Save modules & pricing"}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
      </div>
    </div>
  );
}
