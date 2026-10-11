"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Send } from "lucide-react";
import { refreshPlatformTemplatesAction, submitPlatformTemplatesAction } from "@/lib/whatsapp/platform-template-actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function PlatformTemplateButtons({ unsubmittedKeys }: { unsubmittedKeys: string[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(keys: string[]) {
    if (!window.confirm(`Send ${keys.length} template${keys.length === 1 ? "" : "s"} to WhatsApp for review in the platform's account? Every church on the shared number gets them once approved.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await submitPlatformTemplatesAction(keys);
      setMessage(result.error ?? "Submitted. Approval usually takes minutes to a few hours; press Refresh status to check.");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {unsubmittedKeys.length > 0 && (
          <Button type="button" size="sm" onClick={() => submit(unsubmittedKeys)} disabled={pending}>
            <Send className="size-3.5" />
            {pending ? "Submitting..." : `Submit ${unsubmittedKeys.length} not yet sent`}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await refreshPlatformTemplatesAction();
              setMessage("Statuses refreshed.");
            })
          }
        >
          <RefreshCw className="size-3.5" />
          Refresh status
        </Button>
      </div>
      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
