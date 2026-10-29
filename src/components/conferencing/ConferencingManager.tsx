"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Plus, Trash2, Video } from "lucide-react";
import { createMeetRoomAction, createZoomMeetingAction, deleteConferenceMeetingAction, disconnectConferencingAction } from "@/lib/conferencing/actions";
import { zonedToIso } from "@/lib/conferencing/time";
import { Button } from "@/components/ui/button";
import { ErrorToast } from "@/components/ui/error-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Account {
  email: string | null;
  name: string | null;
}
interface Item {
  id: string;
  provider: "zoom" | "google_meet";
  title: string;
  startTime: string | null;
  durationMinutes: number | null;
  joinUrl: string;
  passcode: string | null;
}

const STATUS: Record<string, string> = {
  connected: "Connected.",
  denied: "The connection was cancelled.",
  forbidden: "Only an owner or admin can connect an account.",
  invalid_state: "That sign-in expired. Please try again.",
  failed: "Couldn't connect the account. Please try again.",
  token_failed: "The provider didn't accept the sign-in. Check that the redirect URL and the Client ID and Secret in the app match the server's settings, then try again.",
  profile_failed: "Signed in, but the account's details couldn't be read. Check that the app has the user:read:user scope (Zoom) or that the Google Meet API is enabled.",
  encryption_failed: "The server's CONNECTION_SECRETS_KEY is missing or not valid (it must be 32 bytes in base64: openssl rand -base64 32).",
  save_failed: "Connected, but it couldn't be saved. Make sure the database update for Zoom and Google Meet (migration 0233) has been applied.",
  not_configured: "This isn't set up on the server yet.",
};

export function ConferencingManager({
  status,
  canWrite,
  canConnect,
  zoom,
  meet,
  meetings,
  timezone,
}: {
  status: string | null;
  canWrite: boolean;
  canConnect: boolean;
  zoom: { available: boolean; missing: string; account: Account | null };
  meet: { available: boolean; missing: string; account: Account | null };
  meetings: Item[];
  timezone: string;
}) {
  const [error, setError] = useState<string | null>(status && status !== "connected" ? (STATUS[status] ?? null) : null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (task: () => Promise<{ error?: string }>) => {
    setError(null);
    start(async () => {
      const result = await task();
      if (result.error) setError(result.error);
    });
  };
  const copy = (id: string, text: string) =>
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });

  return (
    <div className="space-y-6">
      <ErrorToast message={error} />
      {status === "connected" && <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">Account connected.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <ZoomCard missing={zoom.missing} available={zoom.available} account={zoom.account} canWrite={canWrite} canConnect={canConnect} pending={pending} timezone={timezone} run={run} />
        <MeetCard missing={meet.missing} available={meet.available} account={meet.account} canWrite={canWrite} canConnect={canConnect} pending={pending} run={run} />
      </div>

      <div className="space-y-2">
        <h2 className="font-heading text-xl font-bold tracking-tight">Meetings</h2>
        {meetings.length === 0 && <p className="text-sm text-muted-foreground">No meetings yet. Connect an account above, then make one.</p>}
        {meetings.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{m.title}</p>
              <p className="text-xs text-muted-foreground">
                {m.provider === "zoom" ? "Zoom" : "Google Meet"}
                {m.startTime ? ` · ${new Date(m.startTime).toLocaleString(undefined, { timeZone: timezone || undefined, dateStyle: "medium", timeStyle: "short" })}` : m.provider === "zoom" ? " · start any time" : ""}
                {m.durationMinutes ? ` · ${m.durationMinutes} min` : ""}
                {m.passcode ? ` · passcode ${m.passcode}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {m.provider === "zoom" ? (
                <>
                  {canWrite && (
                    <Button size="sm" nativeButton={false} render={<Link href={`/dashboard/kconnect/conferencing/zoom/${m.id}?as=host`} />}>
                      <Video className="size-4" /> Start
                    </Button>
                  )}
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/kconnect/conferencing/zoom/${m.id}`} />}>
                    Join
                  </Button>
                </>
              ) : (
                <Button size="sm" nativeButton={false} render={<a href={m.joinUrl} target="_blank" rel="noopener noreferrer" />}>
                  <ExternalLink className="size-4" /> Open Meet
                </Button>
              )}
              <Button size="sm" variant="outline" aria-label="Copy the invite link" onClick={() => copy(m.id, m.joinUrl)}>
                {copied === m.id ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
              {canWrite && (
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Delete ${m.title}`}
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete "${m.title}"?${m.provider === "zoom" ? " It is cancelled in Zoom too." : ""}`)) run(() => deleteConferenceMeetingAction(m.id));
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Run = (task: () => Promise<{ error?: string }>) => void;

function ConnectRow({ label, missing, available, account, canConnect, connectHref, provider, pending, run }: { label: string; missing: string; available: boolean; account: Account | null; canConnect: boolean; connectHref: string; provider: "zoom" | "google_meet"; pending: boolean; run: Run }) {
  if (!available)
    return (
      <p className="text-sm text-muted-foreground">
        {label} isn&apos;t set up on this server yet.{" "}
        {canConnect && missing ? `The server needs ${missing} in its settings (see .env.example), then a redeploy.` : "Ask the KingdomFlow team."}
      </p>
    );
  if (!account)
    return canConnect ? (
      <Button size="sm" nativeButton={false} render={<a href={connectHref} />}>
        Connect {label}
      </Button>
    ) : (
      <p className="text-sm text-muted-foreground">An owner or admin needs to connect the church&apos;s {label} account.</p>
    );
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>
        Connected: <strong>{account.name || account.email}</strong>
        {account.name && account.email ? <span className="text-muted-foreground"> ({account.email})</span> : null}
      </span>
      {canConnect && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => window.confirm(`Disconnect ${label}? Meetings already made stay in the list.`) && run(() => disconnectConferencingAction(provider))}>
          Disconnect
        </Button>
      )}
    </div>
  );
}

function ZoomCard({ missing, available, account, canWrite, canConnect, pending, timezone, run }: { missing: string; available: boolean; account: Account | null; canWrite: boolean; canConnect: boolean; pending: boolean; timezone: string; run: Run }) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [minutes, setMinutes] = useState(60);
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="font-medium">Zoom</p>
      <ConnectRow label="Zoom" missing={missing} available={available} account={account} canConnect={canConnect} connectHref="/api/zoom/connect" provider="zoom" pending={pending} run={run} />
      {account && canWrite && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              // The time field is in the church's time zone; send it as an exact moment.
              const result = await createZoomMeetingAction({ title, startsAt: startsAt ? zonedToIso(startsAt, timezone) : undefined, durationMinutes: minutes });
              if (!result.error) {
                setTitle("");
                setStartsAt("");
              }
              return result;
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="zoom-title">New meeting</Label>
            <Input id="zoom-title" value={title} maxLength={120} placeholder="e.g. Prayer meeting" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="space-y-1">
              <Label htmlFor="zoom-when">When (leave empty to start any time)</Label>
              <Input id="zoom-when" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="zoom-len">Minutes</Label>
              <Input id="zoom-len" type="number" min={5} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-24" />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending || !title.trim()}>
            <Plus className="size-4" /> Create Zoom meeting
          </Button>
        </form>
      )}
    </div>
  );
}

function MeetCard({ missing, available, account, canWrite, canConnect, pending, run }: { missing: string; available: boolean; account: Account | null; canWrite: boolean; canConnect: boolean; pending: boolean; run: Run }) {
  const [title, setTitle] = useState("");
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="font-medium">Google Meet</p>
      <ConnectRow label="Google Meet" missing={missing} available={available} account={account} canConnect={canConnect} connectHref="/api/google-meet/connect" provider="google_meet" pending={pending} run={run} />
      {account && canWrite && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const result = await createMeetRoomAction({ title });
              if (!result.error) setTitle("");
              return result;
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="meet-title">New meeting room</Label>
            <Input id="meet-title" value={title} maxLength={120} placeholder="e.g. Sunday school" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Google Meet opens in its own tab with all of Meet&apos;s controls. Anyone with the link can join.</p>
          <Button type="submit" size="sm" disabled={pending || !title.trim()}>
            <Plus className="size-4" /> Create Meet room
          </Button>
        </form>
      )}
    </div>
  );
}
