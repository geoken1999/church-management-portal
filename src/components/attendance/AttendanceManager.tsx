"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ClipboardCheck, MapPin, CalendarDays, Users } from "lucide-react";
import { createAttendanceSession, deleteAttendanceSession, type CreateSessionState } from "@/lib/attendance/actions";
import { validateSessionTitle } from "@/lib/attendance/validation";
import type { Branch, Event, AttendanceSession } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type SessionRow = AttendanceSession & {
  branches: { id: string; name: string } | null;
  events: { id: string; title: string } | null;
  attendance_records: { count: number }[];
};

const initialState: CreateSessionState = {};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function CreateSessionDialog({ organizationId, branches, events }: { organizationId: string; branches: Branch[]; events: Event[] }) {
  const router = useRouter();
  const [state, setState] = useState<CreateSessionState>(initialState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [branchId, setBranchId] = useState("none");
  const [eventId, setEventId] = useState("none");
  const [titleTouched, setTitleTouched] = useState(false);

  function reset() {
    setState(initialState);
    setTitle("");
    setBranchId("none");
    setEventId("none");
    setTitleTouched(false);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createAttendanceSession(state, formData);
      setState(result);
      if (result.sessionId) {
        setOpen(false);
        router.push(`/dashboard/attendance/${result.sessionId}`);
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
          <Button type="button">
            <Plus className="size-4" />
            Take attendance
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New attendance session</DialogTitle>
          <DialogDescription>Scope it to a branch, and link it to a calendar event if this is for one.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="eventId" value={eventId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="Sunday Service"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleTouched(true);
              }}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="occurrenceDate">Date</Label>
              <Input id="occurrenceDate" name="occurrenceDate" type="date" defaultValue={todayIso()} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch">Branch</Label>
              <Select value={branchId} onValueChange={(value) => setBranchId(value ?? "none")}>
                <SelectTrigger id="branch" className="w-full">
                  <SelectValue placeholder="All branches">
                    {branchId === "none" ? "All branches" : (branches.find((branch) => branch.id === branchId)?.name ?? "All branches")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {events.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="event">Calendar event</Label>
              <Select
                value={eventId}
                onValueChange={(value) => {
                  const next = value ?? "none";
                  setEventId(next);
                  if (!titleTouched) {
                    const event = events.find((item) => item.id === next);
                    if (event) setTitle(event.title);
                  }
                }}
              >
                <SelectTrigger id="event" className="w-full">
                  <SelectValue placeholder="No event">
                    {eventId === "none" ? "No event" : (events.find((event) => event.id === eventId)?.title ?? "No event")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No event</SelectItem>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                For a recurring event, set the date above to the specific occurrence you&apos;re taking attendance for.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" placeholder="Anything worth remembering about this session" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || Boolean(validateSessionTitle(title))}>
              {pending ? "Creating..." : "Create session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SessionCard({ session, canDelete }: { session: SessionRow; canDelete: boolean }) {
  const presentCount = session.attendance_records?.[0]?.count ?? 0;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4">
        <a href={`/dashboard/attendance/${session.id}`} className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
            <ClipboardCheck className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-heading text-base font-bold">{session.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {formatDate(session.occurrence_date)}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {session.branches?.name ?? "All branches"}
              </span>
              <span className="flex items-center gap-1">
                <Users className="size-3.5" />
                {presentCount} checked in
                {session.headcount != null && ` · ${session.headcount} counted`}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {session.events && <Badge variant="secondary">{session.events.title}</Badge>}
            </div>
          </div>
        </a>
        {canDelete && (
          <form action={deleteAttendanceSession}>
            <input type="hidden" name="sessionId" value={session.id} />
            <Button type="submit" variant="ghost" size="sm">
              <Trash2 className="size-3.5" />
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function AttendanceManager({
  organizationId,
  sessions,
  branches,
  events,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  sessions: SessionRow[];
  branches: Branch[];
  events: Event[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canWrite && <CreateSessionDialog organizationId={organizationId} branches={branches} events={events} />}
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <ClipboardCheck className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No attendance taken yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {canWrite ? 'Click "Take attendance" to start your first session.' : "Check back once attendance has been recorded."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
