"use client";

import { useState, useTransition } from "react";
import { Radio, Check } from "lucide-react";
import { requestLiveStreamAccessAction } from "@/lib/livestream/access-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

const FEATURES = [
  "Members watch live inside the KingdomFlow app, with live chat and a viewer count",
  "Broadcast from a camera in the browser, or from OBS with a stream key",
  "Several streams set up in advance, with a notification to members when you go live",
  "Record the stream to watch again, and show verses and song words to members in the app",
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
          In-app streaming is set up for you by request
        </CardTitle>
        <CardDescription>Going live on YouTube or Facebook from OBS is already available in the Instructions tab. Streaming inside the app runs on our video service, so we set it up with you and it&apos;s billed separately.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          {FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>

        <ErrorToast message={error} />

        {asked ? (
          <Alert>
            <AlertDescription className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0" />
              <span>
                {sent || !requestedAt ? "Request sent." : `You asked on ${new Date(requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`} We&apos;ll be in touch to set it up. You&apos;ll see in-app streaming here as soon as it&apos;s on.
              </span>
            </AlertDescription>
          </Alert>
        ) : canRequest ? (
          <div className="space-y-3">
            <Textarea rows={3} maxLength={1000} value={message} placeholder="Anything we should know? For example how often you plan to go live, or how many members watch (optional)" onChange={(e) => setMessage(e.target.value)} />
            <Button type="button" disabled={pending} onClick={request}>
              {pending ? "Sending…" : "Request in-app streaming"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ask an owner or admin of your church to request in-app streaming.</p>
        )}
      </CardContent>
    </Card>
  );
}
