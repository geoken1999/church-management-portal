"use client";

import { useEffect, useState, useTransition } from "react";
import {
  loadAssignmentAction,
  saveAssignmentAction,
} from "@/lib/lms/assignment-actions";
import {
  hasAssignmentErrors,
  validateAssignment,
  type AssignmentErrors,
  type AssignmentInput,
} from "@/lib/lms/assignment";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";
import { FieldError } from "@/components/auth/FieldError";

// "2025-03-01T10:30" (what a datetime-local field uses) from an ISO instant, in the browser's own time zone.
function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Edits an assignment lesson: what to hand in, how it is marked, the due date and the kinds of hand-in.
export function AssignmentEditor({
  organizationId,
  courseId,
  lessonId,
  onClose,
}: {
  organizationId: string;
  courseId: string;
  lessonId: string;
  onClose: () => void;
}) {
  const [input, setInput] = useState<AssignmentInput | null>(null);
  const [handedIn, setHandedIn] = useState(0);
  const [errors, setErrors] = useState<AssignmentErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadAssignmentAction(organizationId, courseId, lessonId)
      .then((result) => {
        if (cancelled) return;
        if (result.error || !result.loaded)
          setError(result.error ?? "Couldn't open the assignment.");
        else {
          setInput(result.loaded.assignment);
          setHandedIn(result.loaded.handedIn);
        }
      })
      .catch(
        () =>
          !cancelled &&
          setError(
            "Couldn't open the assignment. Check your connection and try again.",
          ),
      );
    return () => {
      cancelled = true;
    };
  }, [organizationId, courseId, lessonId]);

  if (!input)
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          {error ?? "Opening the assignment..."}
          {error && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-3"
              onClick={onClose}
            >
              Close
            </Button>
          )}
        </CardContent>
      </Card>
    );

  const update = (patch: Partial<AssignmentInput>) => {
    setInput({ ...input, ...patch });
    setSaved(false);
  };

  function save() {
    if (!input) return;
    setError(null);
    const found = validateAssignment(input);
    setErrors(found);
    if (hasAssignmentErrors(found)) return;
    startTransition(async () => {
      const result = await saveAssignmentAction(
        organizationId,
        courseId,
        lessonId,
        input,
      ).catch(
        () =>
          ({
            error: "Something went wrong. Check your connection and try again.",
          }) as {
            error?: string;
            errors?: AssignmentErrors;
            success?: boolean;
          },
      );
      if (result.errors) setErrors(result.errors);
      else if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card>
      <ErrorToast message={error} />
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">Assignment</p>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        {handedIn > 0 && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {handedIn} student{handedIn === 1 ? " has" : "s have"} already
            handed this in.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="asg-instructions">What students should hand in</Label>
          <Textarea
            id="asg-instructions"
            rows={5}
            maxLength={4000}
            value={input.instructions}
            onChange={(e) => update({ instructions: e.target.value })}
          />
          <FieldError
            id="asg-instructions-error"
            message={errors.instructions}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="asg-points">Marked out of</Label>
            <Input
              id="asg-points"
              type="number"
              min={1}
              max={1000}
              value={input.maxPoints}
              onChange={(e) => update({ maxPoints: Number(e.target.value) })}
            />
            <FieldError id="asg-points-error" message={errors.maxPoints} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asg-due">Due date (optional)</Label>
            <Input
              id="asg-due"
              type="datetime-local"
              value={toLocalInput(input.dueAt)}
              onChange={(e) =>
                update({
                  dueAt: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : "",
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Late hand-ins are accepted and marked late.
            </p>
            <FieldError id="asg-due-error" message={errors.dueAt} />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Students can hand in</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={input.allowText}
              onChange={(e) => update({ allowText: e.target.checked })}
            />
            Typed text
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={input.allowFile}
              onChange={(e) => update({ allowFile: e.target.checked })}
            />
            A file (PDF, Word, pictures and more, up to 25 MB)
          </label>
          <FieldError id="asg-allow-error" message={errors.allow} />
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" disabled={pending} onClick={save}>
            {pending ? "Saving..." : "Save assignment"}
          </Button>
          {saved && (
            <span className="text-sm text-primary">
              Saved. Publish the lesson to open it to students.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
