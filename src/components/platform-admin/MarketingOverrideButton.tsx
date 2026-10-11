"use client";

import { useTransition } from "react";
import { setMarketingOverrideAction } from "@/lib/whatsapp/health-actions";
import { Button } from "@/components/ui/button";

export function MarketingOverrideButton({ organizationId, overridden }: { organizationId: string; overridden: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant={overridden ? "default" : "outline"}
      disabled={pending}
      onClick={() => startTransition(async () => void (await setMarketingOverrideAction(organizationId, !overridden)))}
    >
      {pending ? "Saving..." : overridden ? "Pause lifted (restore)" : "Lift pause"}
    </Button>
  );
}
