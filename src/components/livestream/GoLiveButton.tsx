"use client";

import { useEffect, useState, useTransition } from "react";
import { Radio, Square } from "lucide-react";
import { endLiveStreamAction, getLiveStateAction, goLiveAction } from "@/lib/livestream/actions";
import { Button } from "@/components/ui/button";

// The Go live / End stream button inside the broadcast room's controls.
export function GoLiveButton({ streamId }: { streamId: string }) {
  const [status, setStatus] = useState<"ready" | "live" | "ended" | null>(null);
  const [viewers, setViewers] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let stopped = false;
    const load = () =>
      getLiveStateAction(streamId).then((s) => {
        if (stopped || s.error) return;
        setStatus(s.status ?? null);
        setViewers(s.viewers ?? 0);
      });
    load();
    const timer = setInterval(load, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [streamId]);

  if (!status || status === "ended") return null;

  function toggle() {
    setMessage(null);
    startTransition(async () => {
      if (status === "live") {
        if (!window.confirm("End the live stream for everyone watching?")) return;
        await endLiveStreamAction(streamId);
        setStatus("ended");
        return;
      }
      const result = await goLiveAction(streamId);
      if (result.error) setMessage(result.error);
      else {
        setStatus("live");
        if (result.warning) setMessage(result.warning);
      }
    });
  }

  return (
    <>
      <Button type="button" variant={status === "live" ? "destructive" : "default"} size="sm" disabled={pending} onClick={toggle} title={status === "live" ? "End the live stream" : "Start the live stream"}>
        {status === "live" ? <Square className="size-3.5" /> : <Radio className="size-3.5" />}
        {status === "live" ? `Live · ${viewers} watching` : pending ? "Starting…" : "Go live"}
      </Button>
      {message && <span className="basis-full text-center text-xs text-destructive">{message}</span>}
    </>
  );
}
