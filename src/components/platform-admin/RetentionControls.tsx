"use client";

import { useTransition } from "react";
import { setAutoDeleteAction, setRetentionExemptAction } from "@/lib/retention/actions";
import { Button } from "@/components/ui/button";

export function AutoDeleteSwitch({ on }: { on: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant={on ? "destructive" : "default"}
      disabled={pending}
      onClick={() => {
        const message = on
          ? "Turn automatic deletion OFF? Lapsed churches will still get reminders but nothing will be deleted."
          : "Turn automatic deletion ON? From the next daily run, any church whose access ended 30+ days ago, that has had its final warning, is not kept, and is not owed money will be deleted for good — its data cannot be recovered.";
        if (window.confirm(message)) startTransition(async () => void (await setAutoDeleteAction(!on)));
      }}
    >
      {pending ? "Saving..." : on ? "Turn off automatic deletion" : "Turn on automatic deletion"}
    </Button>
  );
}

export function KeepForeverButton({ organizationId, exempt }: { organizationId: string; exempt: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" size="sm" variant={exempt ? "default" : "outline"} disabled={pending} onClick={() => startTransition(async () => void (await setRetentionExemptAction(organizationId, !exempt)))}>
      {pending ? "Saving..." : exempt ? "Keeping forever (undo)" : "Keep forever"}
    </Button>
  );
}
