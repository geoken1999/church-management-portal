"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, UserRound, Repeat, Clock, MapPin, Video } from "lucide-react";
import { cn } from "cn";
import { createEvent, updateEvent, deleteEvent, type EventFormState } from "@/lib/events/actions";
import { getOccurrencesInRange, occurrenceLabel } from "@/lib/events/recurrence";
import { RECURRENCE_FREQUENCIES } from "@/lib/events/validation";
import type { Branch, Event, EventMeetingMode, EventRecurrenceFrequency, Member } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type MemberBasic = Pick<Member, "id" | "first_name" | "last_name">;
type BranchBasic = Pick<Branch, "id" | "name">;
type EventRow = Event & { members: MemberBasic | null; branches: BranchBasic | null };

const OPEN_MEETING_LABEL = "Open meeting (not branch-specific)";

const FREQUENCY_LABELS: Record<EventRecurrenceFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const MEETING_MODE_LABELS: Record<EventMeetingMode, string> = {
  offline: "Offline (in-person)",
  online: "Online",
};

function personName(member: MemberBasic | null): string {
  return member ? `${member.first_name} ${member.last_name}` : "Unassigned";
}

function locationName(branch: BranchBasic | null): string {
  return branch ? branch.name : OPEN_MEETING_LABEL;
}

function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The datetime-local inputs have no timezone of their own — resolve them
// against the viewer's local time here in the browser (where "local" is
// unambiguous) before handing off to the server action. Parsing the same
// string server-side would resolve it against the server's timezone
// instead, silently shifting every event by the difference between the two.
function normalizeDateTimeFields(formData: FormData) {
  for (const key of ["startAt", "endAt"]) {
    const raw = formData.get(key);
    if (typeof raw === "string" && raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        formData.set(key, parsed.toISOString());
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------------

const initialEventState: EventFormState = {};

function ManagerSelectField({
  members,
  value,
  onChange,
}: {
  members: MemberBasic[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="managedBy">Event manager</Label>
      <input type="hidden" name="managedBy" value={value} />
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger id="managedBy" className="w-full">
          <SelectValue placeholder="Unassigned">
            {(v: string | null) => personName(members.find((m) => m.id === v) ?? null)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Unassigned</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.first_name} {member.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BranchSelectField({
  branches,
  value,
  onChange,
}: {
  branches: BranchBasic[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="branchId">Location</Label>
      <input type="hidden" name="branchId" value={value} />
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger id="branchId" className="w-full">
          <SelectValue placeholder={OPEN_MEETING_LABEL}>
            {(v: string | null) => locationName(branches.find((b) => b.id === v) ?? null)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{OPEN_MEETING_LABEL}</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MeetingModeField({
  meetingMode,
  onMeetingModeChange,
  event,
  errors,
}: {
  meetingMode: string;
  onMeetingModeChange: (value: string) => void;
  event?: EventRow;
  errors?: EventFormState["fieldErrors"];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="meetingMode">Meeting type</Label>
        <input type="hidden" name="meetingMode" value={meetingMode} />
        <Select value={meetingMode} onValueChange={(v) => onMeetingModeChange(v ?? "offline")}>
          <SelectTrigger id="meetingMode" className="w-full">
            <SelectValue>
              {(v: string | null) => MEETING_MODE_LABELS[(v ?? "offline") as EventMeetingMode]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="offline">{MEETING_MODE_LABELS.offline}</SelectItem>
            <SelectItem value="online">{MEETING_MODE_LABELS.online}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {meetingMode === "online" && (
        <div className="space-y-2">
          <Label htmlFor="meetingLink">Meeting link (optional)</Label>
          <Input
            id="meetingLink"
            name="meetingLink"
            type="url"
            defaultValue={event?.meeting_link ?? ""}
            placeholder="https://zoom.us/j/..."
            aria-invalid={Boolean(errors?.meetingLink)}
            aria-describedby={errors?.meetingLink ? "meetingLink-error" : undefined}
          />
          <FieldError id="meetingLink-error" message={errors?.meetingLink} />
        </div>
      )}
    </div>
  );
}

function EventFields({
  members,
  branches,
  branchId,
  onBranchIdChange,
  meetingMode,
  onMeetingModeChange,
  managedBy,
  onManagedByChange,
  isRecurring,
  onIsRecurringChange,
  frequency,
  onFrequencyChange,
  event,
  errors,
}: {
  members: MemberBasic[];
  branches: BranchBasic[];
  branchId: string;
  onBranchIdChange: (value: string) => void;
  meetingMode: string;
  onMeetingModeChange: (value: string) => void;
  managedBy: string;
  onManagedByChange: (value: string) => void;
  isRecurring: boolean;
  onIsRecurringChange: (value: boolean) => void;
  frequency: string;
  onFrequencyChange: (value: string) => void;
  event?: EventRow;
  errors?: EventFormState["fieldErrors"];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={event?.title}
          placeholder="Sunday Service, Youth Camp, Board Meeting..."
          required
          aria-invalid={Boolean(errors?.title)}
          aria-describedby={errors?.title ? "title-error" : undefined}
        />
        <FieldError id="title-error" message={errors?.title} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startAt">Starts</Label>
          <Input
            id="startAt"
            name="startAt"
            type="datetime-local"
            defaultValue={toDateTimeLocalValue(event?.start_at ?? null)}
            required
            aria-invalid={Boolean(errors?.startAt)}
            aria-describedby={errors?.startAt ? "startAt-error" : undefined}
          />
          <FieldError id="startAt-error" message={errors?.startAt} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endAt">Ends (optional)</Label>
          <Input
            id="endAt"
            name="endAt"
            type="datetime-local"
            defaultValue={toDateTimeLocalValue(event?.end_at ?? null)}
            aria-invalid={Boolean(errors?.endAt)}
            aria-describedby={errors?.endAt ? "endAt-error" : undefined}
          />
          <FieldError id="endAt-error" message={errors?.endAt} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="occurrence">Occurrence</Label>
        <input type="hidden" name="isRecurring" value={isRecurring ? "true" : "false"} />
        <Select
          value={isRecurring ? "recurring" : "one_time"}
          onValueChange={(v) => onIsRecurringChange(v === "recurring")}
        >
          <SelectTrigger id="occurrence" className="w-full">
            <SelectValue>{(v: string | null) => (v === "recurring" ? "Recurring event" : "One-time event")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one_time">One-time event</SelectItem>
            <SelectItem value="recurring">Recurring event</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isRecurring && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="recurrenceFrequency">Repeats</Label>
            <input type="hidden" name="recurrenceFrequency" value={frequency} />
            <Select value={frequency} onValueChange={(v) => onFrequencyChange(v ?? "weekly")}>
              <SelectTrigger
                id="recurrenceFrequency"
                className="w-full"
                aria-invalid={Boolean(errors?.recurrenceFrequency)}
              >
                <SelectValue>
                  {(v: string | null) => FREQUENCY_LABELS[(v ?? "weekly") as EventRecurrenceFrequency]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_FREQUENCIES.map((freq) => (
                  <SelectItem key={freq} value={freq}>
                    {FREQUENCY_LABELS[freq]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="recurrenceFrequency-error" message={errors?.recurrenceFrequency} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurrenceEndDate">Ends on (optional)</Label>
            <Input
              id="recurrenceEndDate"
              name="recurrenceEndDate"
              type="date"
              defaultValue={event?.recurrence_end_date ?? ""}
              aria-invalid={Boolean(errors?.recurrenceEndDate)}
              aria-describedby={errors?.recurrenceEndDate ? "recurrenceEndDate-error" : undefined}
            />
            <FieldError id="recurrenceEndDate-error" message={errors?.recurrenceEndDate} />
          </div>
        </div>
      )}

      <BranchSelectField branches={branches} value={branchId} onChange={onBranchIdChange} />

      <MeetingModeField
        meetingMode={meetingMode}
        onMeetingModeChange={onMeetingModeChange}
        event={event}
        errors={errors}
      />

      <ManagerSelectField members={members} value={managedBy} onChange={onManagedByChange} />

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={event?.description ?? ""}
          placeholder="Optional details"
          rows={2}
        />
      </div>
    </div>
  );
}

function AddEventDialog({
  organizationId,
  members,
  branches,
}: {
  organizationId: string;
  members: MemberBasic[];
  branches: BranchBasic[];
}) {
  const [state, setState] = useState<EventFormState>(initialEventState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [meetingMode, setMeetingMode] = useState("offline");
  const [managedBy, setManagedBy] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState("weekly");

  function handleSubmit(formData: FormData) {
    normalizeDateTimeFields(formData);
    startTransition(async () => {
      const result = await createEvent(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setState(initialEventState);
          setBranchId("");
          setMeetingMode("offline");
          setManagedBy("");
          setIsRecurring(false);
          setFrequency("weekly");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Add event
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an event</DialogTitle>
          <DialogDescription>Schedule a one-time or recurring event.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <EventFields
            members={members}
            branches={branches}
            branchId={branchId}
            onBranchIdChange={setBranchId}
            meetingMode={meetingMode}
            onMeetingModeChange={setMeetingMode}
            managedBy={managedBy}
            onManagedByChange={setManagedBy}
            isRecurring={isRecurring}
            onIsRecurringChange={setIsRecurring}
            frequency={frequency}
            onFrequencyChange={setFrequency}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditEventDialog({
  event,
  members,
  branches,
}: {
  event: EventRow;
  members: MemberBasic[];
  branches: BranchBasic[];
}) {
  const [state, setState] = useState<EventFormState>(initialEventState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(event.branch_id ?? "");
  const [meetingMode, setMeetingMode] = useState<string>(event.meeting_mode);
  const [managedBy, setManagedBy] = useState(event.managed_by ?? "");
  const [isRecurring, setIsRecurring] = useState(event.is_recurring);
  const [frequency, setFrequency] = useState<string>(event.recurrence_frequency ?? "weekly");

  function handleSubmit(formData: FormData) {
    normalizeDateTimeFields(formData);
    startTransition(async () => {
      const result = await updateEvent(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setState(initialEventState);
          setBranchId(event.branch_id ?? "");
          setMeetingMode(event.meeting_mode);
          setManagedBy(event.managed_by ?? "");
          setIsRecurring(event.is_recurring);
          setFrequency(event.recurrence_frequency ?? "weekly");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm">
            <Pencil className="size-3.5" />
            Edit
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit event</DialogTitle>
          <DialogDescription>Update this event&apos;s details.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={event.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <EventFields
            members={members}
            branches={branches}
            branchId={branchId}
            onBranchIdChange={setBranchId}
            meetingMode={meetingMode}
            onMeetingModeChange={setMeetingMode}
            managedBy={managedBy}
            onManagedByChange={setManagedBy}
            isRecurring={isRecurring}
            onIsRecurringChange={setIsRecurring}
            frequency={frequency}
            onFrequencyChange={setFrequency}
            event={event}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// List tab
// ---------------------------------------------------------------------------

function EventCard({
  event,
  members,
  branches,
  canManage,
}: {
  event: EventRow;
  members: MemberBasic[];
  branches: BranchBasic[];
  canManage: boolean;
}) {
  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : null;
  const sameDay = end ? end.toDateString() === start.toDateString() : false;
  const dateLabel = start.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const endLabel = end
    ? end.toLocaleString(undefined, { dateStyle: sameDay ? undefined : "medium", timeStyle: "short" })
    : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h3 className="font-heading text-base font-bold">{event.title}</h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-3.5 shrink-0" />
            <span>
              {dateLabel}
              {endLabel ? ` – ${endLabel}` : ""}
            </span>
          </div>
          <Badge variant={event.is_recurring ? "default" : "outline"}>
            {event.is_recurring && <Repeat className="size-3" />}
            {occurrenceLabel(event)}
          </Badge>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {locationName(event.branches)}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Video className="size-3.5 shrink-0" />
            {MEETING_MODE_LABELS[event.meeting_mode]}
            {event.meeting_mode === "online" && event.meeting_link && (
              <a
                href={event.meeting_link}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Join link
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserRound className="size-3.5 shrink-0" />
            {personName(event.members)}
          </div>
          {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <EditEventDialog event={event} members={members} branches={branches} />
          {canManage && (
            <form action={deleteEvent}>
              <input type="hidden" name="id" value={event.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EventsListTab({
  events,
  members,
  branches,
  canManage,
}: {
  events: EventRow[];
  members: MemberBasic[];
  branches: BranchBasic[];
  canManage: boolean;
}) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No events yet. Click &quot;Add event&quot; to schedule your first one.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <EventCard key={event.id} event={event} members={members} branches={branches} canManage={canManage} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar tab
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function EventCalendar({ events }: { events: EventRow[] }) {
  const [cursor, setCursor] = useState(() => addMonths(new Date(), 0));

  const { days, occurrencesByDate } = useMemo(() => {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    const gridDays = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    const rangeEnd = new Date(gridDays[41]);
    rangeEnd.setHours(23, 59, 59, 999);

    const occurrences = getOccurrencesInRange(events, gridDays[0], rangeEnd);
    const byDate = new Map<string, typeof occurrences>();
    for (const occ of occurrences) {
      const key = toDateKey(occ.date);
      const list = byDate.get(key) ?? [];
      list.push(occ);
      byDate.set(key, list);
    }

    return { days: gridDays, occurrencesByDate: byDate };
  }, [cursor, events]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayKey = toDateKey(new Date());

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h3 className="font-heading text-lg font-bold">{monthLabel}</h3>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="bg-muted px-1 py-2 text-center text-xs font-medium text-muted-foreground">
              {label}
            </div>
          ))}
          {days.map((day) => {
            const key = toDateKey(day);
            const dayOccurrences = occurrencesByDate.get(key) ?? [];
            const inMonth = day.getMonth() === cursor.getMonth();
            const isToday = key === todayKey;

            return (
              <div key={key} className={cn("min-h-24 space-y-1 bg-background p-1.5", !inMonth && "bg-muted/30")}>
                <span
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-full text-xs",
                    !inMonth && "text-muted-foreground",
                    isToday && "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
                <div className="space-y-0.5">
                  {dayOccurrences.slice(0, 3).map((occ, i) => (
                    <div
                      key={`${occ.event.id}-${i}`}
                      title={`${occ.event.title} — ${locationName(occ.event.branches)}`}
                      className="truncate rounded bg-accent px-1 py-0.5 text-[0.7rem] text-accent-foreground"
                    >
                      {occ.event.title}
                    </div>
                  ))}
                  {dayOccurrences.length > 3 && (
                    <div className="text-[0.65rem] text-muted-foreground">+{dayOccurrences.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function EventsManager({
  organizationId,
  members,
  branches,
  events,
  canManage,
}: {
  organizationId: string;
  members: MemberBasic[];
  branches: BranchBasic[];
  events: EventRow[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddEventDialog organizationId={organizationId} members={members} branches={branches} />
      </div>
      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="calendar">Calendar</TabsTab>
          <TabsTab value="list">List</TabsTab>
        </TabsList>
        <TabsPanel value="calendar">
          <EventCalendar events={events} />
        </TabsPanel>
        <TabsPanel value="list">
          <EventsListTab events={events} members={members} branches={branches} canManage={canManage} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
