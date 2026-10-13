"use client";

import { useState } from "react";
import { Gauge, Loader2 } from "lucide-react";
import { jitter, judgeConnection, median, QUALITY_NEEDS, type NetResult } from "@/lib/livestream/netcheck";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

async function measure(): Promise<NetResult> {
  // Round trips to the server.
  const pings: number[] = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    await fetch(`/api/netcheck/ping?t=${Date.now()}-${i}`, { cache: "no-store" });
    pings.push(performance.now() - start);
  }
  const usable = pings.slice(1); // the first one includes setting up the connection
  const pingMs = median(usable);

  const downStart = performance.now();
  const down = await fetch(`/api/netcheck/download?kb=2048&t=${Date.now()}`, { cache: "no-store" });
  const downBytes = (await down.arrayBuffer()).byteLength;
  const downSeconds = Math.max(0.05, (performance.now() - downStart - pingMs) / 1000);

  const payload = new Uint8Array(1536 * 1024);
  crypto.getRandomValues(payload.subarray(0, 65536)); // enough to defeat compression
  const upStart = performance.now();
  await fetch("/api/netcheck/upload", { method: "POST", body: payload, headers: { "Content-Type": "application/octet-stream" }, cache: "no-store" });
  const upSeconds = Math.max(0.05, (performance.now() - upStart - pingMs) / 1000);

  return {
    pingMs,
    jitterMs: jitter(usable),
    downloadMbps: (downBytes * 8) / downSeconds / 1e6,
    uploadMbps: (payload.byteLength * 8) / upSeconds / 1e6,
  };
}

// Tests this computer's connection, and says whether it can carry the stream's quality.
export function NetworkCheck({ quality }: { quality: "low" | "med" | "high" }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<NetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setResult(await measure());
    } catch {
      setError("The test couldn't finish. Check that you are online and try again.");
    } finally {
      setRunning(false);
    }
  }

  const judged = result ? judgeConnection(result, quality) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Gauge className="size-4" />
          Check my connection
          {judged && <Badge variant={judged.verdict === "good" ? "default" : judged.verdict === "limited" ? "secondary" : "destructive"}>{judged.verdict === "good" ? "Good to go" : judged.verdict === "limited" ? "Limited" : "Too weak"}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Run this on the computer you will broadcast from, at the venue, before you go live. This stream is set to {QUALITY_NEEDS[quality].label}, which needs about {QUALITY_NEEDS[quality].needMbps} Mbps of upload.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={running} onClick={run}>
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Gauge className="size-3.5" />}
          {running ? "Testing…" : result ? "Test again" : "Start the test"}
        </Button>
        <ErrorToast message={error} />
        {result && judged && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Upload</p>
                <p className="font-heading text-xl font-bold">{result.uploadMbps.toFixed(1)} Mbps</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Download</p>
                <p className="font-heading text-xl font-bold">{result.downloadMbps.toFixed(1)} Mbps</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Ping</p>
                <p className="font-heading text-xl font-bold">{Math.round(result.pingMs)} ms</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Jitter</p>
                <p className="font-heading text-xl font-bold">{Math.round(result.jitterMs)} ms</p>
              </div>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {judged.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Measured to our servers, so it shows what your connection can do right now. A short test can vary: run it twice if the result surprises you.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
