"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Radio, Plus, Trash2, Eye } from "lucide-react";
import { createLiveStreamAction, deleteLiveStreamAction } from "@/lib/livestream/actions";
import { LAYOUTS, QUALITIES, THEMES } from "@/lib/livestream/validation";
import type { LiveStream } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT_CLASS = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Check({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <input id={id} type="checkbox" className="mt-1 size-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function LiveStreamManager({ streams, canWrite, canDelete, available }: { streams: LiveStream[]; canWrite: boolean; canDelete: boolean; available: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [layout, setLayout] = useState("GRID");
  const [quality, setQuality] = useState("high");
  const [theme, setTheme] = useState("DARK");
  const [orientation, setOrientation] = useState("landscape");
  const [audioOnly, setAudioOnly] = useState(false);
  const [record, setRecord] = useState(false);
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createLiveStreamAction({ title, description, settings: { layout, quality, theme, orientation, audioOnly, record, notifyMembers, chatEnabled } });
      if (result.error || !result.id) {
        setError(result.error ?? "Couldn't create the live stream.");
        return;
      }
      router.push(`/dashboard/livestream/${result.id}`);
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this live stream?")) return;
    startTransition(async () => {
      const result = await deleteLiveStreamAction(id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const live = streams.filter((s) => s.status === "live");
  const ready = streams.filter((s) => s.status === "ready");
  const past = streams.filter((s) => s.status === "ended");

  return (
    <div className="space-y-8">
      <ErrorToast message={error} />
      {!available && (
        <Alert>
          <AlertDescription>Live streaming isn&apos;t set up on this server yet. Ask your developer to add the VideoSDK keys.</AlertDescription>
        </Alert>
      )}

      {canWrite && available && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-4" />
              New live stream
            </CardTitle>
            <CardDescription>Set it up, open the broadcast room, then press Go live. Members see it on their home screen and watch inside the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ls-title">Title</Label>
                <Input id="ls-title" value={title} maxLength={100} placeholder="Sunday service" onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ls-desc">Description (optional)</Label>
                <Textarea id="ls-desc" rows={1} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ls-layout">Layout</Label>
                <select id="ls-layout" className={SELECT_CLASS} value={layout} onChange={(e) => setLayout(e.target.value)}>
                  {LAYOUTS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ls-quality">Quality</Label>
                <select id="ls-quality" className={SELECT_CLASS} value={quality} onChange={(e) => setQuality(e.target.value)}>
                  {QUALITIES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ls-orientation">Screen</Label>
                <select id="ls-orientation" className={SELECT_CLASS} value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                  <option value="landscape">Landscape (wide)</option>
                  <option value="portrait">Portrait (tall, best for phones)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ls-theme">Look</Label>
                <select id="ls-theme" className={SELECT_CLASS} value={theme} onChange={(e) => setTheme(e.target.value)}>
                  {THEMES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Check id="ls-notify" label="Tell members when I go live" hint="A notification to everyone with the app" checked={notifyMembers} onChange={setNotifyMembers} />
              <Check id="ls-chat" label="Live chat" hint="Members can send messages while watching" checked={chatEnabled} onChange={setChatEnabled} />
              <Check id="ls-record" label="Record the stream" hint="Keep a recording to watch again" checked={record} onChange={setRecord} />
              <Check id="ls-audio" label="Audio only" hint="Broadcast sound without video" checked={audioOnly} onChange={setAudioOnly} />
            </div>

            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Members watch in the app. To also go live on YouTube or Facebook, send from OBS straight to them. The stream page explains how, once the stream is created.
            </p>

            <Button type="button" onClick={create} disabled={pending || !title.trim()}>
              <Radio className="size-4" />
              {pending ? "Setting up…" : "Create live stream"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Section title="Live now" empty="Nothing is live right now." streams={live} pending={pending} canDelete={false} onDelete={remove} />
      <Section title="Ready to go live" empty="No streams set up." streams={ready} pending={pending} canDelete={canDelete} onDelete={remove} />
      <Section title="Past streams" empty="No past streams yet." streams={past} pending={pending} canDelete={canDelete} onDelete={remove} />
    </div>
  );
}

function Section({ title, empty, streams, pending, canDelete, onDelete }: { title: string; empty: string; streams: LiveStream[]; pending: boolean; canDelete: boolean; onDelete: (id: string) => void }) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      {streams.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {streams.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  <span className="truncate">{s.title}</span>
                  {s.status === "live" && <Badge variant="destructive">Live</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.started_at ? new Date(s.started_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Not started"}
                  {s.status === "ended" && ` · peak ${s.peak_viewers} watching`}
                  {s.record && " · recorded"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/livestream/${s.id}`} />}>
                  <Eye className="size-3.5" />
                  Open
                </Button>
                {canDelete && s.status !== "live" && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => onDelete(s.id)} aria-label="Delete">
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
