"use client";

import { useTransition } from "react";
import { setFeatureFlag } from "@/lib/platform-admin/actions";
import { Button } from "@/components/ui/button";
import type { TabKey } from "@/lib/permissions/tabs";

// Disabling is the impactful direction (every tenant loses the feature
// immediately, including owners) — confirmed with a native dialog, same
// bar as RevokeSessionButton's single destructive action. Re-enabling has
// no such guard; it's just restoring the normal, expected state.
export function FeatureFlagToggle({ tab, label, enabled }: { tab: TabKey; label: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    if (enabled && !window.confirm(`Turn off "${label}" for every tenant? No organization will be able to use it until you turn it back on here.`)) {
      return;
    }
    startTransition(() => setFeatureFlag(tab, !enabled));
  }

  return (
    <Button
      type="button"
      variant={enabled ? "default" : "destructive"}
      size="sm"
      onClick={handleToggle}
      disabled={pending}
    >
      {pending ? "Saving..." : enabled ? "On" : "Off"}
    </Button>
  );
}
