"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff, RefreshCw, MonitorUp } from "lucide-react";
import { regenerateIngestKeyAction } from "@/lib/livestream/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs">{shown ? value : "•".repeat(24)}</code>
        {secret && (
          <Button type="button" variant="outline" size="icon" onClick={() => setShown(!shown)} aria-label={shown ? "Hide" : "Show"}>
            {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

// Everything needed to stream from OBS Studio (or any WHIP encoder): where to point it,
// the key, whether it is connected, and the setup steps.
export function ObsPanel({ streamId, whipUrl, initialKey, connected }: { streamId: string; whipUrl: string; initialKey: string; connected: boolean }) {
  const [key, setKey] = useState(initialKey);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function regenerate() {
    if (!window.confirm("Make a new key? The old one stops working, so OBS will need the new one.")) return;
    setError(null);
    startTransition(async () => {
      const result = await regenerateIngestKeyAction(streamId);
      if (result.error || !result.key) setError(result.error ?? "Couldn't make a new key.");
      else setKey(result.key);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <MonitorUp className="size-4" />
          Stream from OBS
          {connected ? <Badge>OBS connected</Badge> : <Badge variant="outline">Waiting for OBS</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Use a camera, mixer or slides you set up in OBS Studio instead of the device&apos;s own camera. You don&apos;t need to open the broadcast room. Keep the key private: anyone who has it can send video to this stream.
        </p>

        <div className="space-y-3">
          <CopyField label="Server" value={whipUrl} />
          <CopyField label="Stream key (Bearer token)" value={key} secret />
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={regenerate}>
            <RefreshCw className="size-3.5" />
            Make a new key
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">How to start with OBS</p>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Install <strong>OBS Studio 30 or newer</strong> (free, from obsproject.com). Older versions can&apos;t send to this address.
            </li>
            <li>
              In OBS open <strong>Settings → Stream</strong>. Set <strong>Service</strong> to <strong>WHIP</strong>, paste the <strong>Server</strong> above, and paste the stream key into <strong>Bearer Token</strong>.
            </li>
            <li>
              Open <strong>Settings → Output</strong>, set Output Mode to <strong>Advanced</strong>, and on the Streaming tab use: Encoder <strong>x264</strong> (or your hardware H.264), Rate control <strong>CBR</strong>, Bitrate <strong>2500–4000 Kbps</strong>, Keyframe interval <strong>2 s</strong>, CPU preset <strong>veryfast</strong>, Tune <strong>zerolatency</strong>, and add <code>bframes=0</code> to custom settings. Audio is sent as Opus automatically.
            </li>
            <li>
              Open <strong>Settings → Video</strong> and choose <strong>1280×720</strong> (or 1920×1080) at <strong>30 fps</strong>.
            </li>
            <li>
              In the main window add your sources: <strong>Video Capture Device</strong> for a camera, <strong>Audio Input Capture</strong> for a microphone, and <strong>Window Capture</strong> or <strong>Media Source</strong> for slides or songs. Check the audio meters move.
            </li>
            <li>
              Press <strong>Start Streaming</strong>. This page shows <strong>OBS connected</strong> within a few seconds.
            </li>
            <li>
              Press <strong>Go live</strong> here. Members get the notification and watch in the app.
            </li>
            <li>
              To finish, press <strong>End stream</strong> here, then <strong>Stop Streaming</strong> in OBS.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            If OBS says it can&apos;t connect, check the key and that the stream hasn&apos;t ended. If the stream goes live but the picture is black, check that a source is visible in OBS and that Start Streaming is still on.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
