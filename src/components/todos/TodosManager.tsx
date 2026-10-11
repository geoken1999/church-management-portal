"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, CalendarPlus, CalendarClock, CalendarDays, User } from "lucide-react";
import {
  createTodo,
  updateTodo,
  toggleTodoStatus,
  deleteTodo,
  type TodoFormState,
} from "@/lib/todos/actions";
import { assigneeValue } from "@/lib/todos/assignee";
import { createTodoEventAction, deleteTodoEventAction, updateTodoEventAction } from "@/lib/todos/event-actions";
import type { Todo } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { formatInTimezone, partsInTimezone } from "@/lib/organizations/timezone";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTab, TabsIndicator } from "@/components/ui/tabs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Someone a to-do can be assigned to: a team member who logs in to the
// dashboard (value "u:<id>") or a leader (value "m:<member id>"). See
// src/lib/todos/assignee.ts.
export interface TeamMemberOption {
  value: string;
  name: string;
  group: "Team" | "Leaders";
}

export interface EventOption {
  id: string;
  title: string;
  eventDate: string | null;
}

export type TodoRow = Todo & {
  assignee: { first_name: string; last_name: string } | null;
  assigned_member: { first_name: string; last_name: string } | null;
  creator: { first_name: string; last_name: string } | null;
  event: { id: string; title: string; event_date: string | null } | null;
};

// The church's local date and time, in the form the datetime-local input
// expects. Read in the organization's timezone, so a 7 PM to-do still reads 7 PM
// for someone whose browser is set to a different zone.
function toDatetimeLocal(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const p = partsInTimezone(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

function isOverdue(todo: TodoRow): boolean {
  return todo.status === "pending" && !!todo.due_at && new Date(todo.due_at).getTime() < Date.now();
}

function formatDueDate(iso: string, timeZone: string): string {
  return formatInTimezone(iso, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, "en-US");
}

// ---------------------------------------------------------------------------
// Form fields (shared between create/edit dialogs)
// ---------------------------------------------------------------------------

function TodoFormFields({
  members,
  events,
  eventId,
  onEventIdChange,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  dueAt,
  onDueAtChange,
  assignedTo,
  onAssignedToChange,
  errors,
}: {
  members: TeamMemberOption[];
  events: EventOption[];
  eventId: string;
  onEventIdChange: (value: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  dueAt: string;
  onDueAtChange: (value: string) => void;
  assignedTo: string;
  onAssignedToChange: (value: string) => void;
  errors?: { title?: string; dueAt?: string };
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="todo-title">Title</Label>
        <Input
          id="todo-title"
          name="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Confirm sound check for Sunday"
          aria-invalid={Boolean(errors?.title)}
        />
        <FieldError id="todo-title-error" message={errors?.title} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="todo-event">Event (optional)</Label>
        <Select value={eventId || "none"} onValueChange={(v) => onEventIdChange(v === "none" ? "" : (v ?? ""))}>
          <SelectTrigger id="todo-event" className="w-full">
            <SelectValue>{() => events.find((e) => e.id === eventId)?.title ?? "No event"}</SelectValue>
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
        <input type="hidden" name="eventId" value={eventId} />
        <p className="text-xs text-muted-foreground">Put it in an event, like a camp, to keep its tasks together. Add events with New event.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="todo-description">Description (optional)</Label>
        <Textarea
          id="todo-description"
          name="description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={3}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="todo-due-at">Reminder / due date (optional)</Label>
          <Input
            id="todo-due-at"
            name="dueAt"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => onDueAtChange(e.target.value)}
            aria-invalid={Boolean(errors?.dueAt)}
          />
          <FieldError id="todo-due-at-error" message={errors?.dueAt} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="todo-assigned-to">Assign to (optional)</Label>
          <Select value={assignedTo || "unassigned"} onValueChange={(v) => onAssignedToChange(v === "unassigned" ? "" : (v ?? ""))}>
            <SelectTrigger id="todo-assigned-to" className="w-full">
              <SelectValue>
                {() => members.find((m) => m.value === assignedTo)?.name ?? "Unassigned"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {(["Leaders", "Team"] as const).map((group) => {
                const people = members.filter((m) => m.group === group);
                return people.length === 0 ? null : (
                  <SelectGroup key={group}>
                    <SelectLabel>{group === "Leaders" ? "Leaders" : "Team members (with a login)"}</SelectLabel>
                    {people.map((person) => (
                      <SelectItem key={person.value} value={person.value}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
          <input type="hidden" name="assignedTo" value={assignedTo} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const initialFormState: TodoFormState = {};

function CreateTodoDialog({ members, events, defaultEventId }: { members: TeamMemberOption[]; events: EventOption[]; defaultEventId: string }) {
  const [state, setState] = useState<TodoFormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [eventId, setEventId] = useState(defaultEventId);

  function reset() {
    setState(initialFormState);
    setTitle("");
    setDescription("");
    setDueAt("");
    setAssignedTo("");
    // Adding a to-do while looking at one event's tasks starts on that event.
    setEventId(defaultEventId);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createTodo(state, formData);
      setState(result);
      if (result.success) {
        setOpen(false);
        reset();
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
            Add to-do
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a to-do</DialogTitle>
          <DialogDescription>Track a task for your team, with an optional reminder.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <TodoFormFields
            members={members}
            events={events}
            eventId={eventId}
            onEventIdChange={setEventId}
            title={title}
            onTitleChange={setTitle}
            description={description}
            onDescriptionChange={setDescription}
            dueAt={dueAt}
            onDueAtChange={setDueAt}
            assignedTo={assignedTo}
            onAssignedToChange={setAssignedTo}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add to-do"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

function EditTodoDialog({ todo, members, events, timezone }: { todo: TodoRow; members: TeamMemberOption[]; events: EventOption[]; timezone: string }) {
  const [state, setState] = useState<TodoFormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description ?? "");
  const [dueAt, setDueAt] = useState(toDatetimeLocal(todo.due_at, timezone));
  const [assignedTo, setAssignedTo] = useState(assigneeValue(todo.assigned_to, todo.assigned_member_id));
  const [eventId, setEventId] = useState(todo.todo_event_id ?? "");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateTodo(state, formData);
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
          setState(initialFormState);
          setTitle(todo.title);
          setDescription(todo.description ?? "");
          setDueAt(toDatetimeLocal(todo.due_at, timezone));
          setAssignedTo(assigneeValue(todo.assigned_to, todo.assigned_member_id));
          setEventId(todo.todo_event_id ?? "");
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit to-do" />}>
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit to-do</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={todo.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <TodoFormFields
            members={members}
            events={events}
            eventId={eventId}
            onEventIdChange={setEventId}
            title={title}
            onTitleChange={setTitle}
            description={description}
            onDescriptionChange={setDescription}
            dueAt={dueAt}
            onDueAtChange={setDueAt}
            assignedTo={assignedTo}
            onAssignedToChange={setAssignedTo}
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
// Delete
// ---------------------------------------------------------------------------

function DeleteTodoDialog({ todo }: { todo: TodoRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", todo.id);
      await deleteTodo(formData);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Delete to-do" />}>
        <Trash2 className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this to-do?</DialogTitle>
          <DialogDescription>&ldquo;{todo.title}&rdquo; will be removed for the whole team.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function TodoItemRow({ todo, members, events, timezone }: { todo: TodoRow; members: TeamMemberOption[]; events: EventOption[]; timezone: string }) {
  const [pending, startTransition] = useTransition();
  const overdue = isOverdue(todo);

  function handleToggle(checked: boolean) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", todo.id);
      formData.set("status", checked ? "completed" : "pending");
      await toggleTodoStatus(formData);
    });
  }

  return (
    <div className="flex items-start gap-3 py-3">
      <Checkbox
        checked={todo.status === "completed"}
        onCheckedChange={(checked) => handleToggle(checked === true)}
        disabled={pending}
        aria-label={`Mark "${todo.title}" as ${todo.status === "completed" ? "not done" : "done"}`}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className={todo.status === "completed" ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>
          {todo.title}
        </p>
        {todo.description && <p className="mt-0.5 text-sm text-muted-foreground">{todo.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {todo.due_at && (
            <Badge variant={overdue ? "destructive" : "outline"}>
              <CalendarClock className="size-3" />
              {formatDueDate(todo.due_at, timezone)}
            </Badge>
          )}
          {(todo.assignee ?? todo.assigned_member) && (
            <Badge variant="secondary">
              <User className="size-3" />
              {(todo.assignee ?? todo.assigned_member)?.first_name} {(todo.assignee ?? todo.assigned_member)?.last_name}
              {todo.assigned_member && !todo.assignee ? " (leader)" : ""}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {todo.due_at && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add to calendar"
            nativeButton={false}
            render={<a href={`/api/todos/${todo.id}/ics`} download />}
          >
            <CalendarPlus className="size-3.5" />
          </Button>
        )}
        <EditTodoDialog todo={todo} members={members} events={events} timezone={timezone} />
        <DeleteTodoDialog todo={todo} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const ALL_EVENTS = "all";
const NO_EVENT = "none";

function formatEventDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// Create or rename an event (a camp, a conference): just a name and an
// optional date. Adding one selects it, so the next thing is adding its to-dos.
function EventFormDialog({ event, onSaved, trigger }: { event?: EventOption; onSaved?: (id: string) => void; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(event?.title ?? "");
  const [eventDate, setEventDate] = useState(event?.eventDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = event ? await updateTodoEventAction(event.id, title, eventDate) : await createTodoEventAction(title, eventDate);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onSaved?.(event?.id ?? result.id ?? "");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTitle(event?.title ?? "");
          setEventDate(event?.eventDate ?? "");
          setError(null);
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? "Rename event" : "New event"}</DialogTitle>
          <DialogDescription>{event ? "Change the name or date." : "A camp, a conference, a trip. You can then add its to-dos and assign them."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="todo-event-title">Event name</Label>
            <Input id="todo-event-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Youth Camp 2026" maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="todo-event-date">Date (optional)</Label>
            <Input id="todo-event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : event ? "Save" : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEventButton({ event, onDeleted }: { event: EventOption; onDeleted: () => void }) {
  const [pending, startTransition] = useTransition();
  function handleDelete() {
    if (!window.confirm(`Delete the event "${event.title}"? Its to-dos are kept, just no longer grouped under it.`)) return;
    startTransition(async () => {
      const result = await deleteTodoEventAction(event.id);
      if (!result.error) onDeleted();
    });
  }
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={handleDelete} disabled={pending} aria-label="Delete event">
      <Trash2 className="size-3.5" />
    </Button>
  );
}

export function TodosManager({
  todos,
  members,
  events,
  canWrite,
  canDelete,
  timezone,
}: {
  todos: TodoRow[];
  members: TeamMemberOption[];
  events: EventOption[];
  canWrite: boolean;
  canDelete: boolean;
  timezone: string;
}) {
  const [filter, setFilter] = useState<"active" | "completed" | "all">("active");
  // "all" (every to-do), "none" (not in an event), or an event id.
  const [eventFilter, setEventFilter] = useState<string>(ALL_EVENTS);
  const selectedEvent = events.find((e) => e.id === eventFilter) ?? null;

  const filtered = useMemo(() => {
    const byStatus = filter === "active" ? todos.filter((t) => t.status === "pending") : filter === "completed" ? todos.filter((t) => t.status === "completed") : todos;
    if (eventFilter === ALL_EVENTS) return byStatus;
    if (eventFilter === NO_EVENT) return byStatus.filter((t) => !t.todo_event_id);
    return byStatus.filter((t) => t.todo_event_id === eventFilter);
  }, [todos, filter, eventFilter]);

  // With every to-do showing, those in an event sit together under the
  // event's name (soonest first, undated last), then the ordinary ones.
  const groups = useMemo(() => {
    if (eventFilter !== ALL_EVENTS) return [{ key: "flat", title: null as string | null, items: filtered }];
    const byEvent = new Map<string, { title: string; sortKey: string; items: TodoRow[] }>();
    const general: TodoRow[] = [];
    for (const todo of filtered) {
      if (todo.event) {
        const group = byEvent.get(todo.event.id) ?? { title: todo.event.title, sortKey: todo.event.event_date ?? "9999-12-31", items: [] };
        group.items.push(todo);
        byEvent.set(todo.event.id, group);
      } else {
        general.push(todo);
      }
    }
    const eventGroups = [...byEvent.entries()].sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey)).map(([id, g]) => ({ key: id, title: g.title as string | null, items: g.items }));
    return [...eventGroups, ...(general.length > 0 ? [{ key: "general", title: eventGroups.length > 0 ? "General" : null, items: general }] : [])];
  }, [filtered, eventFilter]);

  const activeCount = todos.filter((t) => t.status === "pending").length;
  const selectedTodos = selectedEvent ? todos.filter((t) => t.todo_event_id === selectedEvent.id) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter((v as typeof filter) ?? "active")}>
          <TabsList>
            <TabsIndicator />
            <TabsTab value="active">Active ({activeCount})</TabsTab>
            <TabsTab value="completed">Completed</TabsTab>
            <TabsTab value="all">All</TabsTab>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          {events.length > 0 && (
            <Select value={eventFilter} onValueChange={(v) => setEventFilter(v ?? ALL_EVENTS)}>
              <SelectTrigger className="w-48" aria-label="Show an event">
                <SelectValue>{() => (eventFilter === ALL_EVENTS ? "All events" : eventFilter === NO_EVENT ? "No event" : (selectedEvent?.title ?? "Event"))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_EVENTS}>All events</SelectItem>
                <SelectItem value={NO_EVENT}>No event</SelectItem>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canWrite && (
            <EventFormDialog
              onSaved={(id) => id && setEventFilter(id)}
              trigger={
                <Button type="button" variant="outline">
                  <CalendarDays className="size-4" />
                  New event
                </Button>
              }
            />
          )}
          <CreateTodoDialog members={members} events={events} defaultEventId={selectedEvent ? selectedEvent.id : ""} />
        </div>
      </div>

      {selectedEvent && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-accent">
                <CalendarDays className="size-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{selectedEvent.title}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedEvent.eventDate ? `${formatEventDate(selectedEvent.eventDate)} · ` : ""}
                  {selectedTodos.filter((t) => t.status === "pending").length} open · {selectedTodos.length} total
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canWrite && (
                <EventFormDialog
                  event={selectedEvent}
                  trigger={
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Rename event">
                      <Pencil className="size-3.5" />
                    </Button>
                  }
                />
              )}
              {canDelete && <DeleteEventButton event={selectedEvent} onDeleted={() => setEventFilter(ALL_EVENTS)} />}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {selectedEvent ? "No to-dos in this event yet. Use Add to-do to add the first one." : filter === "active" ? "Nothing to do — you're all caught up." : "No to-dos here."}
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.key}>
                  {group.title && (
                    <div className="flex items-center gap-2 border-b border-border pt-2 pb-1.5">
                      <CalendarDays className="size-4 text-primary" />
                      <p className="text-sm font-semibold">{group.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {group.items.filter((t) => t.status === "pending").length} open · {group.items.length} total
                      </span>
                    </div>
                  )}
                  <div className="divide-y divide-border">
                    {group.items.map((todo) => (
                      <TodoItemRow key={todo.id} todo={todo} members={members} events={events} timezone={timezone} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
