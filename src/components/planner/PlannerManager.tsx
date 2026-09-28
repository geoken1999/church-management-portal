"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, CalendarClock, X, Check, FileDown } from "lucide-react";
import {
  createPlan,
  updatePlan,
  deletePlan,
  addPlanItem,
  togglePlanItem,
  assignPlanItem,
  deletePlanItem,
  exportPlanPdf,
  type PlanFormState,
} from "@/lib/planner/actions";
import { PLAN_STATUSES } from "@/lib/planner/validation";
import type { Plan, PlanItem, PlanStatus } from "@/types/database";
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

export type PlanRow = Plan & { creator: { first_name: string; last_name: string } | null };

export interface LeaderOption {
  id: string;
  first_name: string;
  last_name: string;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([byteNumbers], { type: mimeType });
}

function downloadFile(base64: string, mimeType: string, filename: string) {
  const blob = base64ToBlob(base64, mimeType);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
};

const PLAN_STATUS_BADGE_VARIANTS: Record<PlanStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  active: "default",
  completed: "secondary",
};

function isOverdue(plan: PlanRow): boolean {
  return plan.status === "active" && !!plan.target_date && new Date(plan.target_date) < new Date(new Date().toDateString());
}

function formatTargetDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// "HH:MM" (24-hour, no date) -> "10:00 AM" — a plain string parse, not
// Date-based, since these are times-of-day, not timestamps.
function formatTime(time: string): string {
  const [hourStr, minute] = time.split(":");
  const hour = Number(hourStr);
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

function formatTimeRange(item: PlanItem): string | null {
  if (item.startTime && item.endTime) {
    const start = formatTime(item.startTime);
    const end = formatTime(item.endTime);
    // Drop the start's AM/PM when it matches the end's — "10:00–11:00 AM"
    // reads as cleanly as "10:00 AM – 11:00 AM" but fits a narrow badge
    // without wrapping.
    const startLabel = start.slice(-2) === end.slice(-2) ? start.slice(0, -3) : start;
    return `${startLabel}–${end}`;
  }
  if (item.startTime) return formatTime(item.startTime);
  return null;
}

// Scheduled steps (have a startTime) sort chronologically first, forming a
// running agenda; plain checklist steps with no time follow in whatever
// order they were added — a mixed list (some timed, some not) still reads
// sensibly rather than interleaving unpredictably.
function sortedItems(items: PlanItem[]): PlanItem[] {
  const timed = items.filter((item) => item.startTime).sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));
  const untimed = items.filter((item) => !item.startTime);
  return [...timed, ...untimed];
}

// ---------------------------------------------------------------------------
// Form fields (shared between create/edit dialogs) — title, notes, status,
// target date. Checklist items are deliberately not part of this form; they
// live on the card itself (see PlanItemsSection) so adding/checking one off
// is a single click, not "open edit, scroll to items, save."
// ---------------------------------------------------------------------------

function PlanFormFields({
  title,
  onTitleChange,
  notes,
  onNotesChange,
  status,
  onStatusChange,
  targetDate,
  onTargetDateChange,
  errors,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  status: PlanStatus;
  onStatusChange: (value: PlanStatus) => void;
  targetDate: string;
  onTargetDateChange: (value: string) => void;
  errors?: { title?: string; targetDate?: string };
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="plan-title">Title</Label>
        <Input
          id="plan-title"
          name="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Sunday service, Building renovation..."
          aria-invalid={Boolean(errors?.title)}
        />
        <FieldError id="plan-title-error" message={errors?.title} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="plan-notes">Notes (optional)</Label>
        <Textarea
          id="plan-notes"
          name="notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={4}
          placeholder="Jot down anything worth remembering about this plan..."
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="plan-status">Status</Label>
          <input type="hidden" name="status" value={status} />
          <Select value={status} onValueChange={(v) => onStatusChange((v ?? "draft") as PlanStatus)}>
            <SelectTrigger id="plan-status" className="w-full">
              <SelectValue>{() => PLAN_STATUS_LABELS[status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PLAN_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {PLAN_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-target-date">Target date (optional)</Label>
          <Input
            id="plan-target-date"
            name="targetDate"
            type="date"
            value={targetDate}
            onChange={(e) => onTargetDateChange(e.target.value)}
            aria-invalid={Boolean(errors?.targetDate)}
          />
          <FieldError id="plan-target-date-error" message={errors?.targetDate} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const initialFormState: PlanFormState = {};

function CreatePlanDialog() {
  const [state, setState] = useState<PlanFormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<PlanStatus>("draft");
  const [targetDate, setTargetDate] = useState("");

  function reset() {
    setState(initialFormState);
    setTitle("");
    setNotes("");
    setStatus("draft");
    setTargetDate("");
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createPlan(state, formData);
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
            New plan
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription>Jot down an initiative, then add checklist items once it&apos;s created.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <PlanFormFields
            title={title}
            onTitleChange={setTitle}
            notes={notes}
            onNotesChange={setNotes}
            status={status}
            onStatusChange={setStatus}
            targetDate={targetDate}
            onTargetDateChange={setTargetDate}
            errors={state.fieldErrors}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create plan"}
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

function EditPlanDialog({ plan }: { plan: PlanRow }) {
  const [state, setState] = useState<PlanFormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(plan.title);
  const [notes, setNotes] = useState(plan.notes ?? "");
  const [status, setStatus] = useState<PlanStatus>(plan.status);
  const [targetDate, setTargetDate] = useState(plan.target_date ?? "");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updatePlan(state, formData);
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
          setTitle(plan.title);
          setNotes(plan.notes ?? "");
          setStatus(plan.status);
          setTargetDate(plan.target_date ?? "");
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit plan" />}>
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit plan</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={plan.id} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <PlanFormFields
            title={title}
            onTitleChange={setTitle}
            notes={notes}
            onNotesChange={setNotes}
            status={status}
            onStatusChange={setStatus}
            targetDate={targetDate}
            onTargetDateChange={setTargetDate}
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

function DeletePlanDialog({ plan }: { plan: PlanRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", plan.id);
      await deletePlan(formData);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Delete plan" />}>
        <Trash2 className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this plan?</DialogTitle>
          <DialogDescription>&ldquo;{plan.title}&rdquo; and its checklist will be removed for the whole team.</DialogDescription>
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
// Checklist — the frequently-touched part of a plan, so it's inline on the
// card rather than behind the edit dialog.
// ---------------------------------------------------------------------------

function PlanItemsSection({ plan, leaders }: { plan: PlanRow; leaders: LeaderOption[] }) {
  const [pending, startTransition] = useTransition();
  const [newItemText, setNewItemText] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  function leaderName(id: string): string {
    const leader = leaders.find((l) => l.id === id);
    return leader ? `${leader.first_name} ${leader.last_name}` : "";
  }

  function handleToggle(itemId: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", plan.id);
      formData.set("itemId", itemId);
      await togglePlanItem(formData);
    });
  }

  function handleAssign(itemId: string, assignedTo: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", plan.id);
      formData.set("itemId", itemId);
      formData.set("assignedTo", assignedTo);
      await assignPlanItem(formData);
    });
  }

  function handleDeleteItem(itemId: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", plan.id);
      formData.set("itemId", itemId);
      await deletePlanItem(formData);
    });
  }

  function handleAddItem() {
    const text = newItemText.trim();
    if (!text) return;
    setAddError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", plan.id);
      formData.set("text", text);
      formData.set("startTime", newStartTime);
      formData.set("endTime", newEndTime);
      formData.set("assignedTo", newAssignedTo);
      const result = await addPlanItem(formData);
      if (result.error) {
        setAddError(result.error);
        return;
      }
      setNewItemText("");
      setNewStartTime("");
      setNewEndTime("");
      setNewAssignedTo("");
    });
  }

  const doneCount = plan.items.filter((item) => item.done).length;
  const items = sortedItems(plan.items);

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {plan.items.length > 0 && (
        <p className="text-xs font-medium text-muted-foreground">
          {doneCount} / {plan.items.length} done
        </p>
      )}
      {items.map((item) => {
        const timeRange = formatTimeRange(item);
        return (
          <div key={item.id} className="group flex flex-wrap items-center gap-2">
            <Checkbox
              checked={item.done}
              onCheckedChange={() => handleToggle(item.id)}
              disabled={pending}
              aria-label={`Mark "${item.text}" as ${item.done ? "not done" : "done"}`}
            />
            {timeRange && (
              <span
                className={`w-36 shrink-0 truncate font-mono text-xs ${item.done ? "text-muted-foreground" : "text-primary"}`}
                title={timeRange}
              >
                {timeRange}
              </span>
            )}
            <span className={`min-w-24 flex-1 text-sm ${item.done ? "text-muted-foreground line-through" : ""}`}>{item.text}</span>
            <Select value={item.assignedTo ?? "unassigned"} onValueChange={(v) => handleAssign(item.id, v === "unassigned" ? "" : (v ?? ""))}>
              <SelectTrigger size="sm" className="w-36 shrink-0 text-xs" aria-label={`Assign "${item.text}"`}>
                <SelectValue>{() => (item.assignedTo ? leaderName(item.assignedTo) : "Unassigned")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {leaders.map((leader) => (
                  <SelectItem key={leader.id} value={leader.id}>
                    {leader.first_name} {leader.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover:opacity-100"
              aria-label={`Remove "${item.text}"`}
              onClick={() => handleDeleteItem(item.id)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        );
      })}

      {addError && (
        <Alert variant="destructive">
          <AlertDescription>{addError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Input
          type="time"
          value={newStartTime}
          onChange={(e) => setNewStartTime(e.target.value)}
          aria-label="Start time (optional)"
          className="h-8 w-28 text-sm"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="time"
          value={newEndTime}
          onChange={(e) => setNewEndTime(e.target.value)}
          aria-label="End time (optional)"
          className="h-8 w-28 text-sm"
        />
        <Input
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddItem();
            }
          }}
          placeholder="Add a step, e.g. Worship time"
          className="h-8 min-w-40 flex-1 text-sm"
        />
        {leaders.length > 0 && (
          <Select value={newAssignedTo || "unassigned"} onValueChange={(v) => setNewAssignedTo(v === "unassigned" ? "" : (v ?? ""))}>
            <SelectTrigger size="sm" className="w-36 shrink-0 text-xs" aria-label="Assign to (optional)">
              <SelectValue>{() => (newAssignedTo ? leaderName(newAssignedTo) : "Unassigned")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {leaders.map((leader) => (
                <SelectItem key={leader.id} value={leader.id}>
                  {leader.first_name} {leader.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button type="button" variant="outline" size="icon-sm" aria-label="Add step" onClick={handleAddItem} disabled={!newItemText.trim()}>
          <Check className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF export — only while a plan is Active (see exportPlanPdf's own doc
// comment for why), so a run sheet always matches what the team is
// currently executing rather than a stale draft or old history.
// ---------------------------------------------------------------------------

function ExportPlanPdfButton({ plan }: { plan: PlanRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const result = await exportPlanPdf(plan.id);
      if (result.error || !result.base64 || !result.filename || !result.mimeType) {
        setError(result.error ?? "Couldn't generate that PDF.");
        return;
      }
      downloadFile(result.base64, result.mimeType, result.filename);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Export as PDF" onClick={handleExport} disabled={pending}>
        <FileDown className="size-3.5" />
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function PlanCard({ plan, leaders }: { plan: PlanRow; leaders: LeaderOption[] }) {
  const overdue = isOverdue(plan);

  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-base font-bold">{plan.title}</h3>
              <Badge variant={PLAN_STATUS_BADGE_VARIANTS[plan.status]}>{PLAN_STATUS_LABELS[plan.status]}</Badge>
              {plan.target_date && (
                <Badge variant={overdue ? "destructive" : "outline"}>
                  <CalendarClock className="size-3" />
                  {formatTargetDate(plan.target_date)}
                </Badge>
              )}
            </div>
            {plan.notes && <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{plan.notes}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {plan.status === "active" && <ExportPlanPdfButton plan={plan} />}
            <EditPlanDialog plan={plan} />
            <DeletePlanDialog plan={plan} />
          </div>
        </div>
        <PlanItemsSection plan={plan} leaders={leaders} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function PlannerManager({ plans, leaders }: { plans: PlanRow[]; leaders: LeaderOption[] }) {
  const [filter, setFilter] = useState<"active" | "draft" | "completed" | "all">("active");

  const filtered = useMemo(() => {
    if (filter === "all") return plans;
    return plans.filter((p) => p.status === filter);
  }, [plans, filter]);

  const activeCount = plans.filter((p) => p.status === "active").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter((v as typeof filter) ?? "active")}>
          <TabsList>
            <TabsIndicator />
            <TabsTab value="active">Active ({activeCount})</TabsTab>
            <TabsTab value="draft">Draft</TabsTab>
            <TabsTab value="completed">Completed</TabsTab>
            <TabsTab value="all">All</TabsTab>
          </TabsList>
        </Tabs>
        <CreatePlanDialog />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === "active" ? "No active plans yet — start one to jot down your next initiative." : "No plans here."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((plan) => (
            <PlanCard key={plan.id} plan={plan} leaders={leaders} />
          ))}
        </div>
      )}
    </div>
  );
}
