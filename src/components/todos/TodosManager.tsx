"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, CalendarPlus, CalendarClock, User } from "lucide-react";
import {
  createTodo,
  updateTodo,
  toggleTodoStatus,
  deleteTodo,
  type TodoFormState,
} from "@/lib/todos/actions";
import type { Todo } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldError } from "@/components/auth/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export interface TeamMemberOption {
  authUserId: string;
  name: string;
}

export type TodoRow = Todo & {
  assignee: { first_name: string; last_name: string } | null;
  creator: { first_name: string; last_name: string } | null;
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isOverdue(todo: TodoRow): boolean {
  return todo.status === "pending" && !!todo.due_at && new Date(todo.due_at).getTime() < Date.now();
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Form fields (shared between create/edit dialogs)
// ---------------------------------------------------------------------------

function TodoFormFields({
  members,
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
                {() => members.find((m) => m.authUserId === assignedTo)?.name ?? "Unassigned"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.authUserId} value={member.authUserId}>
                  {member.name}
                </SelectItem>
              ))}
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

function CreateTodoDialog({ members }: { members: TeamMemberOption[] }) {
  const [state, setState] = useState<TodoFormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  function reset() {
    setState(initialFormState);
    setTitle("");
    setDescription("");
    setDueAt("");
    setAssignedTo("");
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

function EditTodoDialog({ todo, members }: { todo: TodoRow; members: TeamMemberOption[] }) {
  const [state, setState] = useState<TodoFormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description ?? "");
  const [dueAt, setDueAt] = useState(toDatetimeLocal(todo.due_at));
  const [assignedTo, setAssignedTo] = useState(todo.assigned_to ?? "");

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
          setDueAt(toDatetimeLocal(todo.due_at));
          setAssignedTo(todo.assigned_to ?? "");
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

function TodoItemRow({ todo, members }: { todo: TodoRow; members: TeamMemberOption[] }) {
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
              {formatDueDate(todo.due_at)}
            </Badge>
          )}
          {todo.assignee && (
            <Badge variant="secondary">
              <User className="size-3" />
              {todo.assignee.first_name} {todo.assignee.last_name}
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
        <EditTodoDialog todo={todo} members={members} />
        <DeleteTodoDialog todo={todo} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function TodosManager({ todos, members }: { todos: TodoRow[]; members: TeamMemberOption[] }) {
  const [filter, setFilter] = useState<"active" | "completed" | "all">("active");

  const filtered = useMemo(() => {
    if (filter === "active") return todos.filter((t) => t.status === "pending");
    if (filter === "completed") return todos.filter((t) => t.status === "completed");
    return todos;
  }, [todos, filter]);

  const activeCount = todos.filter((t) => t.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter((v as typeof filter) ?? "active")}>
          <TabsList>
            <TabsIndicator />
            <TabsTab value="active">Active ({activeCount})</TabsTab>
            <TabsTab value="completed">Completed</TabsTab>
            <TabsTab value="all">All</TabsTab>
          </TabsList>
        </Tabs>
        <CreateTodoDialog members={members} />
      </div>

      <Card>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {filter === "active" ? "Nothing to do — you're all caught up." : "No to-dos here."}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((todo) => (
                <TodoItemRow key={todo.id} todo={todo} members={members} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
