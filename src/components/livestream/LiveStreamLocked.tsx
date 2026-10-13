"use client";

import { useState, useTransition } from "react";
import { Radio, Check } from "lucide-react";
import { requestLiveStreamAccessAction } from "@/lib/livestream/access-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  "Members watch live inside the app, with live chat and a viewer count",
  "Broadcast from a camera in the browser, or from OBS with a stream key",
  "Also send to YouTube and Facebook at the same time",
  "Record the stream and notify members when you go live",
];

// What a church sees when live streaming isn't turned on for it: what it is, and a way to ask.
export function LiveStreamLocked({ requestedAt, canRequest }: { requestedAt: string | null; canRequest: boolean }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const asked = sent || requestedAt !== null;

  function request() {
    setError(null);
    startTransition(async () => {
      const result = await requestLiveStreamAccessAction(message);
      if (result.error) setError(result.error);
      else setSent(true);
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="size-5" />
          Live streaming is set up for you by request
        </CardTitle>
        <CardDescription>We set it up with you so it works well for your church, and it&apos;s billed separately.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          {FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {asked ? (
          <Alert>
            <AlertDescription className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0" />
              <span>
                {sent || !requestedAt ? "Request sent." : `You asked on ${new Date(requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`} We&apos;ll be in touch to set it up. You&apos;ll see live streaming here as soon as it&apos;s on.
              </span>
            </AlertDescription>
          </Alert>
        ) : canRequest ? (
          <div className="space-y-3">
            <Textarea rows={3} maxLength={1000} value={message} placeholder="Anything we should know? For example how often you plan to go live, or how many members watch (optional)" onChange={(e) => setMessage(e.target.value)} />
            <Button type="button" disabled={pending} onClick={request}>
              {pending ? "Sending…" : "Contact us to enable"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ask an owner or admin of your church to request live streaming.</p>
        )}
      </CardContent>
    </Card>
  );
}
