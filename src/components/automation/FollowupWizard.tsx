"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import {
  createFollowupAutomation,
  type FollowupFieldErrors,
  setFollowupStatus,
  updateFollowupAutomation,
  type FollowupFormInput,
} from "@/lib/automations/followup-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STEPS = ["Basics", "Trigger", "Action", "Review"] as const;
const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export interface FollowupWizardProps {
  // Set when editing an existing automation; the wizard then saves changes to it.
  automationId?: string;
  initial?: Partial<FollowupFormInput>;
  branches: { id: string; name: string }[];
  assignees: { authUserId: string; name: string }[];
  timezone: string;
}

const DEFAULTS: FollowupFormInput = {
  name: "",
  description: "",
  status: "draft",
  requiredConsecutive: 3,
  runWeekday: 1,
  branchIds: [],
  allBranches: true,
  assigneeUserId: "",
  dueWorkingDays: 2,
  priority: "normal",
};

export function FollowupWizard({ automationId, initial, branches, assignees, timezone }: FollowupWizardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FollowupFormInput>({ ...DEFAULTS, ...initial });
  const [errors, setErrors] = useState<FollowupFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const update = <K extends keyof FollowupFormInput>(key: K, value: FollowupFormInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleBranch = (id: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      branchIds: checked ? [...prev.branchIds, id] : prev.branchIds.filter((b) => b !== id),
    }));
  };

  // Each step checks only its own fields so the user sees problems where
  // they are. The server runs the full set again on save.
  const stepProblems = (index: number): Record<string, string> => {
    const problems: Record<string, string> = {};
    if (index === 0) {
      if (!form.name.trim()) problems.name = "Give this automation a name.";
      if (!form.allBranches && form.branchIds.length === 0) problems.branchIds = "Choose at least one branch, or apply to all branches.";
    }
    if (index === 1) {
      if (!Number.isInteger(form.requiredConsecutive) || form.requiredConsecutive < 2 || form.requiredConsecutive > 12) {
        problems.requiredConsecutive = "Choose between 2 and 12 Sundays.";
      }
    }
    if (index === 2) {
      if (!form.assigneeUserId) problems.assigneeUserId = "Choose who receives the follow-up tasks.";
      if (!Number.isInteger(form.dueWorkingDays) || form.dueWorkingDays < 0 || form.dueWorkingDays > 14) {
        problems.dueWorkingDays = "Choose between 0 and 14 working days.";
      }
    }
    return problems;
  };

  const goNext = () => {
    const problems = stepProblems(step);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const save = (status: "draft" | "active") => {
    setFormError(null);
    startTransition(async () => {
      const payload: FollowupFormInput = { ...form, status };
      if (automationId) {
        const saved = await updateFollowupAutomation(automationId, payload);
        if (saved.error) {
          setFormError(saved.error);
          setErrors(saved.fieldErrors ?? {});
          return;
        }
        if (status === "active") {
          const activated = await setFollowupStatus(automationId, "active");
          if (activated.error) {
            setFormError(`Changes saved. ${activated.error}`);
            return;
          }
        }
        router.push(`/dashboard/automation/followup/${automationId}`);
        return;
      }

      const created = await createFollowupAutomation(payload);
      if (created.error) {
        setFormError(created.id ? `Saved as a draft. ${created.error}` : created.error);
        setErrors(created.fieldErrors ?? {});
        if (created.id) router.push(`/dashboard/automation/followup/${created.id}`);
        return;
      }
      router.push(`/dashboard/automation/followup/${created.id}`);
    });
  };

  const branchNames = form.allBranches
    ? "All branches"
    : branches
        .filter((b) => form.branchIds.includes(b.id))
        .map((b) => b.name)
        .join(", ");
  const assigneeName = assignees.find((a) => a.authUserId === form.assigneeUserId)?.name ?? "Not chosen";

  return (
    <div className="space-y-6">
      <ol className="grid grid-cols-4 gap-2 text-sm">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={
              index === step
                ? "rounded-lg bg-primary px-3 py-2 text-center font-medium text-primary-foreground"
                : index < step
                  ? "rounded-lg bg-accent px-3 py-2 text-center text-foreground"
                  : "rounded-lg border px-3 py-2 text-center text-muted-foreground"
            }
            aria-current={index === step ? "step" : undefined}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>
            {step === 0 && "Name this automation and choose which branches it looks at."}
            {step === 1 && `When the check runs, in ${timezone}, and how many missed Sundays trigger a follow-up.`}
            {step === 2 && "Who receives the follow-up tasks, and how long they have to act."}
            {step === 3 && "Check the details, then save as a draft or activate it."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="followup-name">Name</Label>
                <Input id="followup-name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Sunday absence follow-up" />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="followup-description">Description (optional)</Label>
                <Input
                  id="followup-description"
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Check in with members who have stopped attending"
                />
              </div>
              <div className="space-y-2">
                <Label>Branches</Label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.allBranches} onChange={(e) => update("allBranches", e.target.checked)} />
                  All branches
                </label>
                {!form.allBranches && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.branchIds.includes(b.id)}
                          onChange={(e) => toggleBranch(b.id, e.target.checked)}
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                )}
                {errors.branchIds && <p className="text-sm text-destructive">{errors.branchIds}</p>}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="followup-consecutive">Missed Sundays in a row</Label>
                <Input
                  id="followup-consecutive"
                  type="number"
                  min={2}
                  max={12}
                  value={form.requiredConsecutive}
                  onChange={(e) => update("requiredConsecutive", Number(e.target.value))}
                />
                <p className="text-sm text-muted-foreground">
                  A member is flagged when they have no attendance across this many recorded Sundays in a row. Sundays whose register wasn&apos;t marked
                  complete are skipped, not counted as absences.
                </p>
                {errors.requiredConsecutive && <p className="text-sm text-destructive">{errors.requiredConsecutive}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="followup-weekday">Run on</Label>
                <select
                  id="followup-weekday"
                  className={SELECT_CLASS}
                  value={form.runWeekday}
                  onChange={(e) => update("runWeekday", Number(e.target.value))}
                >
                  {WEEKDAYS.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground">Runs once a week, early in the morning, using {timezone}. Monday lets the Sunday register be marked complete first.</p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="followup-assignee">Assign tasks to</Label>
                <select
                  id="followup-assignee"
                  className={SELECT_CLASS}
                  value={form.assigneeUserId}
                  onChange={(e) => update("assigneeUserId", e.target.value)}
                >
                  <option value="">Choose a person</option>
                  {assignees.map((a) => (
                    <option key={a.authUserId} value={a.authUserId}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground">Only people who can work on To Do tasks are listed.</p>
                {errors.assigneeUserId && <p className="text-sm text-destructive">{errors.assigneeUserId}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="followup-due">Due in working days</Label>
                  <Input
                    id="followup-due"
                    type="number"
                    min={0}
                    max={14}
                    value={form.dueWorkingDays}
                    onChange={(e) => update("dueWorkingDays", Number(e.target.value))}
                  />
                  {errors.dueWorkingDays && <p className="text-sm text-destructive">{errors.dueWorkingDays}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="followup-priority">Priority</Label>
                  <select
                    id="followup-priority"
                    className={SELECT_CLASS}
                    value={form.priority}
                    onChange={(e) => update("priority", e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Nothing is sent to the member. The assignee gets a To Do task and a notification that doesn&apos;t name anyone.
              </p>
            </>
          )}

          {step === 3 && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Summary label="Name" value={form.name || "—"} />
              <Summary label="Branches" value={branchNames} />
              <Summary label="Trigger" value={`${form.requiredConsecutive} missed Sundays in a row`} />
              <Summary label="Runs on" value={`${WEEKDAYS[form.runWeekday]} (${timezone})`} />
              <Summary label="Assigned to" value={assigneeName} />
              <Summary label="Due" value={`${form.dueWorkingDays} working day${form.dueWorkingDays === 1 ? "" : "s"} after the task is created`} />
              <Summary label="Priority" value={form.priority} />
              <Summary label="Member messages" value="None. Tasks only." />
            </dl>
          )}

          {formError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {step === 0 ? (
            <Button variant="ghost" nativeButton={false} render={<Link href={automationId ? `/dashboard/automation/followup/${automationId}` : "/dashboard/automation/followup"} />}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" type="button" onClick={() => setStep((s) => s - 1)} disabled={isPending}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
          )}
        </div>

        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext}>
            Next
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => save("draft")} disabled={isPending}>
              Save as draft
            </Button>
            <Button type="button" onClick={() => save("active")} disabled={isPending}>
              {isPending ? "Saving…" : "Save and activate"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
