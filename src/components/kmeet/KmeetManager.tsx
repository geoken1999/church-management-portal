"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Video, Plus, Calendar, Trash2 } from "lucide-react";
import { scheduleMeetingAction, startInstantMeetingAction, cancelMeetingAction, type KmeetFormState } from "@/lib/kmeet/actions";
import type { KmeetMeetingStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

function InstantMeetingButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startInstantMeetingAction(title);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/dashboard/kmeet/${result.meetingId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" disabled={disabled}>
            <Video className="size-4" />
            Start instant meeting
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
        <DialogFooter>
          <Button type="button" onClick={handleStart} disabled={pending}>
            {pending ? "Starting..." : "Start meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleMeetingDialog({ events, disabled }: { events: KmeetEventOption[]; disabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<KmeetFormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState<string>("none");

  function reset() {
    setState(initialFormState);
    setEventId("none");
  }

  function handleSubmit(formData: FormData) {
    if (eventId !== "none") formData.set("eventId", eventId);
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
            Schedule a meeting
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a meeting</DialogTitle>
          <DialogDescription>Gets a join link now — the call itself starts when the first person joins at that time.</DialogDescription>
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
              <Label className="text-xs">Link to an event (optional)</Label>
              <Select value={eventId} onValueChange={(v) => setEventId(v ?? "none")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => (eventId === "none" ? "No linked event" : (events.find((e) => e.id === eventId)?.title ?? "No linked event"))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked event</SelectItem>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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

function MeetingCard({ meeting, canManage }: { meeting: KmeetMeetingRow; canManage: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleCancel() {
    if (!window.confirm(`Cancel "${meeting.title}"?`)) return;
    startTransition(() => {
      cancelMeetingAction(meeting.id);
    });
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
          <Button type="button" size="sm" nativeButton={false} render={<a href={`/dashboard/kmeet/${meeting.id}`} />}>
            Join
          </Button>
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
  canWrite,
  available,
  events,
  upcoming,
  past,
}: {
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
          <AlertDescription>Video calling isn&apos;t configured yet — ask your developer to set it up.</AlertDescription>
        </Alert>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <ScheduleMeetingDialog events={events} disabled={!available} />
          <InstantMeetingButton disabled={!available} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            Upcoming &amp; live
          </CardTitle>
          <CardDescription>Scheduled meetings and any that are currently live.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
          ) : (
            <div className="divide-y divide-border">
              {upcoming.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} canManage={canWrite} />
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
                <MeetingCard key={meeting.id} meeting={meeting} canManage={canWrite} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
