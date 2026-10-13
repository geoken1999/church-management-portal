"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Radio, Square, ExternalLink, Send, Users, Film } from "lucide-react";
import { endLiveStreamAction, endStreamAndRoomAction, getLiveStateAction, getRecordingsAction, goLiveAction, sendHostChatAction, type LiveState } from "@/lib/livestream/actions";
import type { LiveStream } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ObsPanel } from "@/components/livestream/ObsPanel";

const LAYOUT_NAMES = { GRID: "Grid", SPOTLIGHT: "Spotlight", SIDEBAR: "Sidebar" } as const;
const QUALITY_NAMES = { low: "Standard", med: "HD", high: "Full HD" } as const;

export function LiveStudio({ stream, canWrite, whipUrl }: { stream: LiveStream; canWrite: boolean; whipUrl: string }) {
  const [state, setState] = useState<LiveState>({ status: stream.status, viewers: 0, peak: stream.peak_viewers, messages: [] });
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [recordings, setRecordings] = useState<{ url: string; start: string | null }[] | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const next = await getLiveStateAction(stream.id);
    if (!next.error) setState(next);
  }, [stream.id]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 4000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [state.messages?.length]);

  const status = state.status ?? stream.status;

  function run(fn: () => Promise<{ error?: string; warning?: string }>) {
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setNotice({ kind: "error", text: result.error });
      else if (result.warning) setNotice({ kind: "info", text: result.warning });
      await refresh();
    });
  }

  function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    sendHostChatAction(stream.id, text).then(refresh);
  }

  async function loadRecordings() {
    const result = await getRecordingsAction(stream.id);
    if (result.error) setNotice({ kind: "error", text: result.error });
    else setRecordings(result.recordings ?? []);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-bold tracking-tight">{stream.title}</h1>
          {status === "live" && <Badge variant="destructive">Live</Badge>}
          {status === "ready" && <Badge variant="outline">Not live yet</Badge>}
          {status === "ended" && <Badge variant="secondary">Ended</Badge>}
        </div>
        {stream.description && <p className="text-muted-foreground">{stream.description}</p>}
        <p className="text-xs text-muted-foreground">
          {LAYOUT_NAMES[stream.layout]} layout · {QUALITY_NAMES[stream.quality]} · {stream.orientation} · {stream.audio_only ? "audio only" : "video"}
          {stream.record && " · recording"}
          {stream.rtmp_outputs.length > 0 && ` · also to ${stream.rtmp_outputs.map((o) => o.name).join(", ")}`}
        </p>
      </div>

      {notice && (
        <Alert variant={notice.kind === "error" ? "destructive" : "default"}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}

      {status !== "ended" && canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>Go live</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Join the broadcast room with your camera and mic, or send from OBS (below), then press <strong>Go live</strong>. Everyone in the room is part of the broadcast; viewers only watch.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" nativeButton={false} render={<a href={`/broadcast/${stream.id}`} target="_blank" rel="noreferrer" />}>
                <ExternalLink className="size-4" />
                Open broadcast room
              </Button>
              {status === "ready" && (
                <Button type="button" disabled={pending} onClick={() => run(() => goLiveAction(stream.id))}>
                  <Radio className="size-4" />
                  {pending ? "Starting…" : "Go live"}
                </Button>
              )}
              {status === "live" && (
                <Button type="button" variant="destructive" disabled={pending} onClick={() => window.confirm("End the live stream for everyone watching?") && run(() => endLiveStreamAction(stream.id))}>
                  <Square className="size-4" />
                  End stream
                </Button>
              )}
              <Button type="button" variant="ghost" disabled={pending} onClick={() => window.confirm("End the stream and close the room?") && run(() => endStreamAndRoomAction(stream.id))}>
                End stream and room
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canWrite && stream.ingest_key && status !== "ended" && <ObsPanel streamId={stream.id} whipUrl={whipUrl} initialKey={stream.ingest_key} connected={state.ingestActive ?? stream.ingest_active} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" />
              Watching
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Now</p>
              <p className="font-heading text-3xl font-bold">{status === "live" ? (state.viewers ?? 0) : 0}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Peak</p>
              <p className="font-heading text-3xl font-bold">{state.peak ?? stream.peak_viewers}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Started</p>
              <p className="text-sm">{stream.started_at ? new Date(stream.started_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "—"}</p>
            </div>
            {stream.record && status === "ended" && (
              <div className="col-span-3 space-y-2">
                <Button type="button" variant="outline" size="sm" onClick={loadRecordings}>
                  <Film className="size-4" />
                  Get recording
                </Button>
                {recordings && recordings.length === 0 && <p className="text-xs text-muted-foreground">The recording isn&apos;t ready yet. Try again in a few minutes.</p>}
                {recordings?.map((r) => (
                  <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="block text-sm text-primary underline">
                    Recording{r.start ? ` from ${new Date(r.start).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {stream.chat_enabled && (
          <Card>
            <CardHeader>
              <CardTitle>Live chat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-64 space-y-2 overflow-y-auto text-sm">
                {(state.messages ?? []).length === 0 && <p className="text-muted-foreground">No messages yet.</p>}
                {(state.messages ?? []).map((m) => (
                  <p key={m.id}>
                    <span className={m.author_kind === "host" ? "font-semibold text-primary" : "font-semibold"}>{m.author_name}</span> {m.body}
                  </p>
                ))}
                <div ref={chatEnd} />
              </div>
              {canWrite && status !== "ended" && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                >
                  <Input value={draft} maxLength={300} placeholder="Message everyone watching" onChange={(e) => setDraft(e.target.value)} />
                  <Button type="submit" size="icon" aria-label="Send">
                    <Send className="size-4" />
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
