"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getZoomJoinAction } from "@/lib/conferencing/actions";

// Zoom's own Meeting SDK (Component View), loaded from Zoom, drawn inside this page: the full Zoom meeting window
// with all of its controls (mute, camera, share, chat, participants, reactions, record if allowed, leave...).
interface ZoomEmbeddedClient {
  init(options: { zoomAppRoot: HTMLElement; language: string; patchJsMedia?: boolean; leaveOnPageUnload?: boolean; customize?: { video?: { isResizable?: boolean; viewSizes?: { default: { width: number; height: number } } } } }): Promise<unknown>;
  join(options: { signature: string; meetingNumber: string; password: string; userName: string; zak?: string }): Promise<unknown>;
  leaveMeeting?(): Promise<unknown>;
}
declare global {
  interface Window {
    ZoomMtgEmbedded?: { createClient(): ZoomEmbeddedClient };
  }
}

function loadSdk(version: string): Promise<void> {
  if (window.ZoomMtgEmbedded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://source.zoom.us/${version}/zoom-meeting-embedded-${version}.min.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Zoom. Check your connection and try again."));
    document.head.appendChild(script);
  });
}

export function ZoomCall({ meetingId, as }: { meetingId: string; as: "host" | "guest" }) {
  const root = useRef<HTMLDivElement>(null);
  const clientRef = useRef<ZoomEmbeddedClient | null>(null);
  const [state, setState] = useState<"idle" | "joining" | "in" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setState("joining");
    setError(null);
    try {
      const details = await getZoomJoinAction(meetingId, as);
      if (details.error || !details.signature || !details.meetingNumber || !details.sdkVersion) throw new Error(details.error ?? "Couldn't join the meeting.");
      await loadSdk(details.sdkVersion);
      if (!window.ZoomMtgEmbedded || !root.current) throw new Error("Zoom didn't load.");
      const client = window.ZoomMtgEmbedded.createClient();
      clientRef.current = client;
      await client.init({
        zoomAppRoot: root.current,
        language: "en-US",
        patchJsMedia: true,
        leaveOnPageUnload: true,
        // Fill the space on the page.
        customize: { video: { isResizable: true, viewSizes: { default: { width: Math.max(480, root.current.clientWidth), height: Math.max(360, Math.round(window.innerHeight * 0.72)) } } } },
      });
      await client.join({ signature: details.signature, meetingNumber: details.meetingNumber, password: details.passcode ?? "", userName: details.userName ?? "Guest", zak: details.zak });
      setState("in");
    } catch (e) {
      const reason = e as { reason?: string; message?: string };
      setError(reason.reason || reason.message || "Couldn't join the meeting.");
      setState("error");
    }
  }

  // Leave if the person moves to another page.
  useEffect(() => {
    return () => {
      clientRef.current?.leaveMeeting?.().catch(() => undefined);
    };
  }, []);

  return (
    <div className="space-y-3">
      {state !== "in" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
          <button
            type="button"
            onClick={join}
            disabled={state === "joining"}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {state === "joining" && <Loader2 className="size-4 animate-spin" />}
            {as === "host" ? "Start the meeting" : "Join the meeting"}
          </button>
          <p className="text-sm text-muted-foreground">{as === "host" ? "You start it as the host, with the church's Zoom account." : "You join as a guest."} Allow the camera and microphone when your browser asks.</p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div ref={root} className="min-h-[70vh] w-full overflow-hidden rounded-xl" />
    </div>
  );
}
