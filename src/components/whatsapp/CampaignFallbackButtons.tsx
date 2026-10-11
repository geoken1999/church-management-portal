"use client";

import { useState, useTransition } from "react";
import { resendCampaignByFallbackAction } from "@/lib/whatsapp/fallback-actions";
import { Button } from "@/components/ui/button";

// On a campaign that left some people unreached (failed or skipped because
// of WhatsApp's marketing limit): resend those by SMS or email.
export function CampaignFallbackButtons({ campaignId, count }: { campaignId: string; count: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function resend(channel: "sms" | "email") {
    if (!window.confirm(`Resend this message to ${count} ${count === 1 ? "person" : "people"} by ${channel === "sms" ? "SMS" : "email"}? It uses your ${channel === "sms" ? "SMS" : "email"} allowance.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await resendCampaignByFallbackAction(campaignId, channel);
      setMessage(
        result.sent
          ? `Sent to ${result.sent}${result.failed ? `, ${result.failed} couldn't be reached (${result.error ?? "no contact details"})` : ""}.`
          : (result.error ?? "Nothing was sent."),
      );
    });
  }

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {count} not reached on WhatsApp:
        </span>
        <Button type="button" size="xs" variant="outline" onClick={() => resend("sms")} disabled={pending}>
          Resend by SMS
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={() => resend("email")} disabled={pending}>
          Resend by email
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
