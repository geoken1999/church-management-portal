"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Radio, Square } from "lucide-react";
import { endStreamAndRoomAction, getLiveStateAction, goLiveAction } from "@/lib/livestream/actions";
import { Button } from "@/components/ui/button";
import { ErrorToast } from "@/components/ui/error-toast";

// The Go live / End stream button inside the broadcast room's controls.
export function GoLiveButton({ streamId, onEnded }: { streamId: string; onEnded?: () => void }) {
  const [status, setStatus] = useState<"ready" | "live" | "ended" | null>(null);
  const [viewers, setViewers] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const seen = useRef<string | null>(null);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    let stopped = false;
    const load = () =>
      getLiveStateAction(streamId).then((s) => {
        if (stopped || s.error) return;
        // Ended from somewhere else (the studio page, the app): this room is done too.
        if (s.status === "ended" && seen.current && seen.current !== "ended") onEndedRef.current?.();
        seen.current = s.status ?? null;
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
        // Ending the stream closes its room too.
        const ended = await endStreamAndRoomAction(streamId);
        if (ended.error) {
          setMessage(ended.error);
          return;
        }
        seen.current = "ended";
        setStatus("ended");
        onEnded?.();
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
      <ErrorToast message={message} />
    </>
  );
}
