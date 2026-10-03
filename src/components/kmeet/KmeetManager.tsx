"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Video, Headphones, Plus, Calendar, Trash2, Link as LinkIcon, Check } from "lucide-react";
import { scheduleMeetingAction, startInstantMeetingAction, cancelMeetingAction, type KmeetFormState } from "@/lib/kmeet/actions";
import { dashboardBasePathForMode, publicBasePathForMode, labelForMode } from "@/lib/kmeet/mode";
import type { KmeetMeetingStatus, KmeetMode } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export interface KmeetEventOption {
  id: string;
  title: string;
}

export interface KmeetMeetingRow {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string | null;
  status: KmeetMeetingStatus;
  events: { id: string; title: string } | null;
}

const initialFormState: KmeetFormState = {};

function InstantMeetingButton({ mode, disabled }: { mode: KmeetMode; disabled: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [requireAdmission, setRequireAdmission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const Icon = mode === "audio" ? Headphones : Video;

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startInstantMeetingAction(title, requireAdmission, mode);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`${dashboardBasePathForMode(mode)}/${result.meetingId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" disabled={disabled}>
            <Icon className="size-4" />
            Start instant {mode === "audio" ? "call" : "meeting"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a meeting now</DialogTitle>
          <DialogDescription>Opens right away — share the link with whoever should join.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="instant-title">Title (optional)</Label>
          <Input id="instant-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quick sync" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={requireAdmission} onCheckedChange={(checked) => setRequireAdmission(checked === true)} />
          Require admission (host must let each person in)
        </label>
        <DialogFooter>
          <Button type="button" onClick={handleStart} disabled={pending}>
            {pending ? "Starting..." : "Start meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleMeetingDialog({ mode, events, disabled }: { mode: KmeetMode; events: KmeetEventOption[]; disabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<KmeetFormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState<string>("none");
  const [requireAdmission, setRequireAdmission] = useState(false);

  function reset() {
    setState(initialFormState);
    setEventId("none");
    setRequireAdmission(false);
  }

  function handleSubmit(formData: FormData) {
    if (eventId !== "none") formData.set("eventId", eventId);
    formData.set("requireAdmission", String(requireAdmission));
    formData.set("mode", mode);
    startTransition(async () => {
      const result = await scheduleMeetingAction(state, formData);
      setState(result);
      if (result.meetingId) {
        setOpen(false);
        reset();
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" disabled={disabled}>
            <Plus className="size-4" />
            Schedule {mode === "audio" ? "a call" : "a meeting"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule {mode === "audio" ? "a call" : "a meeting"}</DialogTitle>
          <DialogDescription>
            Gets a join link now — the call itself starts when the first person joins at that time. Also shows up on your Events calendar
            automatically.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="schedule-title">Title</Label>
            <Input id="schedule-title" name="title" placeholder="Leadership call" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-description">Description (optional)</Label>
            <Textarea id="schedule-description" name="description" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-at">Date &amp; time</Label>
            <Input id="schedule-at" name="scheduledAt" type="datetime-local" required />
          </div>
          {events.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Attach to an existing event (optional)</Label>
              <Select value={eventId} onValueChange={(v) => setEventId(v ?? "none")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => (eventId === "none" ? "Create a new event for this" : (events.find((e) => e.id === eventId)?.title ?? "Create a new event for this"))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Create a new event for this</SelectItem>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={requireAdmission} onCheckedChange={(checked) => setRequireAdmission(checked === true)} />
            Require admission (host must let each person in)
          </label>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Scheduling..." : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function statusBadge(status: KmeetMeetingStatus) {
  if (status === "live") return <Badge variant="secondary">Live</Badge>;
  if (status === "ended") return <Badge variant="outline">Ended</Badge>;
  return <Badge variant="outline">Scheduled</Badge>;
}

function MeetingCard({ mode, meeting, canManage }: { mode: KmeetMode; meeting: KmeetMeetingRow; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function handleCancel() {
    if (!window.confirm(`Cancel "${meeting.title}"?`)) return;
    startTransition(() => {
      cancelMeetingAction(meeting.id);
    });
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}${publicBasePathForMode(mode)}/${meeting.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{meeting.title}</span>
          {statusBadge(meeting.status)}
        </div>
        {meeting.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{meeting.description}</p>}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {meeting.scheduled_at
            ? new Date(meeting.scheduled_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
            : "Instant meeting"}
          {meeting.events ? ` · ${meeting.events.title}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meeting.status !== "ended" && (
          <>
            <Button type="button" size="icon" variant="ghost" onClick={handleCopyLink} title="Copy invite link">
              {copied ? <Check className="size-4" /> : <LinkIcon className="size-4" />}
            </Button>
            <Button type="button" size="sm" nativeButton={false} render={<a href={`${dashboardBasePathForMode(mode)}/${meeting.id}`} />}>
              Join
            </Button>
          </>
        )}
        {canManage && meeting.status === "scheduled" && (
          <Button type="button" size="icon" variant="ghost" onClick={handleCancel} disabled={pending} title="Cancel meeting">
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function KmeetManager({
  mode,
  canWrite,
  available,
  events,
  upcoming,
  past,
}: {
  mode: KmeetMode;
  canWrite: boolean;
  available: boolean;
  events: KmeetEventOption[];
  upcoming: KmeetMeetingRow[];
  past: KmeetMeetingRow[];
}) {
  return (
    <div className="space-y-6">
      {!available && (
        <Alert variant="destructive">
          <AlertDescription>
            {mode === "audio" ? "Audio" : "Video"} calling isn&apos;t configured yet — ask your developer to set it up.
          </AlertDescription>
        </Alert>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <ScheduleMeetingDialog mode={mode} events={events} disabled={!available} />
          <InstantMeetingButton mode={mode} disabled={!available} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            Upcoming &amp; live
          </CardTitle>
          <CardDescription>Scheduled {labelForMode(mode)} calls and any that are currently live.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
          ) : (
            <div className="divide-y divide-border">
              {upcoming.map((meeting) => (
                <MeetingCard key={meeting.id} mode={mode} meeting={meeting} canManage={canWrite} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {past.map((meeting) => (
                <MeetingCard key={meeting.id} mode={mode} meeting={meeting} canManage={canWrite} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
