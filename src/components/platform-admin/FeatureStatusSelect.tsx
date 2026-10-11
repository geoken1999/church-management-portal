"use client";

import { useTransition } from "react";
import { setFeatureStatus } from "@/lib/platform-admin/actions";
import { FEATURE_STATUSES, FEATURE_STATUS_HELP, FEATURE_STATUS_LABELS, type FeatureStatus } from "@/lib/platform-admin/feature-status";
import type { TabKey } from "@/lib/permissions/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Off and Testing take the module away from most or all tenants, so those
// two are confirmed with a native dialog (same bar as RevokeSessionButton).
// Moving to Beta or Live only ever gives access, so it needs no guard.
export function FeatureStatusSelect({ tab, label, status }: { tab: TabKey; label: string; status: FeatureStatus }) {
  const [pending, startTransition] = useTransition();

  function handleChange(next: FeatureStatus) {
    if (next === status) return;
    if (next === "off" && !window.confirm(`Turn off "${label}" for every tenant? No organization will be able to use it until you change this back.`)) return;
    if (next === "testing" && !window.confirm(`Move "${label}" to Testing? Only the test users will be able to use it; everyone else loses access.`)) return;
    startTransition(() => setFeatureStatus(tab, next));
  }

  return (
    <Select value={status} onValueChange={(v) => handleChange((v ?? status) as FeatureStatus)} disabled={pending}>
      <SelectTrigger className="w-36" aria-label={`Status of ${label}`}>
        <SelectValue>{() => (pending ? "Saving..." : FEATURE_STATUS_LABELS[status])}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {FEATURE_STATUSES.map((value) => (
          <SelectItem key={value} value={value}>
            {FEATURE_STATUS_LABELS[value]} · {FEATURE_STATUS_HELP[value].split(".")[0]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
