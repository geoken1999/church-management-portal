"use client";

import { useActionState, useState } from "react";
import { updateMobileFeatures, type UpdateMobileFeaturesState } from "@/lib/organizations/actions";
import { MOBILE_FEATURE_GROUPS, MOBILE_FEATURE_LIMIT } from "@/lib/organizations/mobile-features";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Smartphone } from "lucide-react";

const initialState: UpdateMobileFeaturesState = {};

export function MobileFeaturesManager({
  organizationId,
  initialFeatures,
}: {
  organizationId: string;
  initialFeatures: string[];
}) {
  const { t } = useLocale();
  const [selected, setSelected] = useState<string[]>(initialFeatures);
  const [state, formAction, pending] = useActionState(updateMobileFeatures, initialState);

  const atLimit = selected.length >= MOBILE_FEATURE_LIMIT;

  function toggle(itemKey: string) {
    setSelected((prev) => {
      if (prev.includes(itemKey)) return prev.filter((k) => k !== itemKey);
      if (prev.length >= MOBILE_FEATURE_LIMIT) return prev;
      return [...prev, itemKey];
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="features" value={selected.join(",")} />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-accent">
              <Smartphone className="size-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">
                {selected.length} / {MOBILE_FEATURE_LIMIT} selected
              </p>
              <p className="text-sm text-muted-foreground">Uncheck one to pick a different feature once you&apos;re at the limit.</p>
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert>
          <AlertDescription>Saved.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {MOBILE_FEATURE_GROUPS.map((group) => (
          <Card key={group.groupKey}>
            <CardContent>
              <h3 className="mb-3 font-heading text-sm font-bold">{t.nav.groups[group.groupKey]}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {group.itemKeys.map((itemKey) => {
                  const checked = selected.includes(itemKey);
                  return (
                    <label
                      key={itemKey}
                      className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors ${
                        checked ? "bg-accent/60" : atLimit ? "opacity-50" : "hover:bg-muted/60"
                      } ${!checked && atLimit ? "cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!checked && atLimit}
                        onCheckedChange={() => toggle(itemKey)}
                        aria-label={t.nav.items[itemKey]}
                      />
                      {t.nav.items[itemKey]}
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </form>
  );
}
