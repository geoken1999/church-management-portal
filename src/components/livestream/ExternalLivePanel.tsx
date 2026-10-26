"use client";

import { useState, useTransition } from "react";
import { Radio, Square } from "lucide-react";
import { endExternalLiveAction, startExternalLiveAction } from "@/lib/livestream/external-actions";
import { PLATFORM_NAMES, type ExternalPlatform } from "@/lib/livestream/external-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Tells members the church is live on YouTube or Facebook: a "Live now" card in the app and, if wanted, a notification.
export function ExternalLivePanel({ active, canWrite }: { active: { title: string; platform: ExternalPlatform; url: string } | null; canWrite: boolean }) {
  const [title, setTitle] = useState("Sunday Service");
  const [url, setUrl] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(task: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const result = await task();
      if (result.error) setError(result.error);
      else setUrl("");
    });
  }

  return (
    <Card className={active ? "border-primary/50" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="size-4" />
          Tell your members you&apos;re live
        </CardTitle>
        <CardDescription>After you start your YouTube or Facebook stream, paste its link here. Members see a Live now card in the app and can get a notification that opens the stream.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorToast message={error} />
        {active ? (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{active.title}</span> is showing to members as live on {PLATFORM_NAMES[active.platform]}.
            </p>
            <p className="break-all text-xs text-muted-foreground">{active.url}</p>
            <p className="text-xs text-muted-foreground">A YouTube stream is removed from the app by itself soon after it ends on YouTube. Press the button to remove it sooner, or for a Facebook stream.</p>
            {canWrite && (
              <Button type="button" variant="destructive" disabled={pending} onClick={() => run(endExternalLiveAction)}>
                <Square className="size-4" />
                {pending ? "Ending…" : "We've finished: remove the Live now card"}
              </Button>
            )}
          </div>
        ) : canWrite ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => startExternalLiveAction({ title, url, notify }));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="el-title">Title</Label>
              <Input id="el-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="el-url">Link of your live stream</Label>
              <Input id="el-url" value={url} placeholder="https://www.youtube.com/watch?v=… or a Facebook live link" inputMode="url" autoComplete="off" onChange={(e) => setUrl(e.target.value)} />
              <p className="text-xs text-muted-foreground">In YouTube Studio use Share on your live stream and copy the link. A channel&apos;s own live address (youtube.com/@yourchurch/live) also works.</p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 size-4" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <span>
                Send members a notification
                <span className="block text-xs text-muted-foreground">Everyone with the app gets “{title.trim() || "Your stream"} is live”.</span>
              </span>
            </label>
            <Button type="submit" disabled={pending || !url.trim() || !title.trim()}>
              <Radio className="size-4" />
              {pending ? "Telling members…" : "We're live: tell members"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Ask someone with edit access to Live stream to announce your stream.</p>
        )}
      </CardContent>
    </Card>
  );
}
