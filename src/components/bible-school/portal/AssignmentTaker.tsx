"use client";

import { useCallback, useEffect, useState } from "react";
import { portal, portalError, type PAssignment } from "@/lib/lms/portal-client";
import {
  MAX_ANSWER_CHARS,
  SUBMISSION_FORMATS_LABEL,
  markLabel,
  submissionFileProblem,
} from "@/lib/lms/assignment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// An assignment inside a lesson: the brief, a box for typed text and/or a file to attach, and afterwards the
// student's hand-in with the mark and feedback. Handing in completes the lesson.
export function AssignmentTaker({
  lessonId,
  onHandedIn,
}: {
  lessonId: string;
  onHandedIn: () => void;
}) {
  const [work, setWork] = useState<PAssignment | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // When the page was opened, to say whether the due date has passed.
  const [openedAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await portal.assignment(lessonId);
      setWork(loaded);
      setText(loaded.submission?.answer_text ?? "");
    } catch (e) {
      setError(portalError(e, "Couldn't open this assignment."));
    }
  }, [lessonId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function submit() {
    if (!work) return;
    setError(null);
    if (file) {
      const problem = submissionFileProblem({
        name: file.name,
        size: file.size,
      });
      if (problem) return setError(problem);
    }
    if (!text.trim() && !file && !work.submission?.file_name)
      return setError("Add your answer or a file before handing in.");
    setBusy(true);
    try {
      await portal.submitAssignment(lessonId, text, file);
      setFile(null);
      setEditing(false);
      await load();
      onHandedIn();
    } catch (e) {
      setError(portalError(e));
    } finally {
      setBusy(false);
    }
  }

  async function openFile() {
    try {
      const link = await portal.submissionLink(lessonId);
      window.open(link.url, "_blank", "noopener");
    } catch (e) {
      setError(portalError(e, "Couldn't open that file."));
    }
  }

  if (error && !work)
    return <p className="text-sm text-destructive">{error}</p>;
  if (!work)
    return (
      <p className="text-sm text-muted-foreground">Opening the assignment...</p>
    );

  const sub = work.submission;
  const showForm = !sub || (editing && work.can_submit);
  const overdue = work.due_at
    ? new Date(work.due_at).getTime() < openedAt
    : false;

  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-lg bg-muted/40 p-4">
        <p className="whitespace-pre-wrap text-sm">{work.instructions}</p>
        <p className="text-xs text-muted-foreground">
          Marked out of {work.max_points}
          {work.due_at
            ? ` · due ${new Date(work.due_at).toLocaleString()}${overdue && !sub ? " (late hand-ins are accepted and marked late)" : ""}`
            : ""}
        </p>
      </div>

      {sub && !showForm && (
        <div className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={sub.status === "graded" ? "default" : "secondary"}>
              {sub.status === "graded"
                ? "Marked"
                : "Handed in, waiting for your teacher"}
            </Badge>
            {sub.is_late && <Badge variant="destructive">Late</Badge>}
            <span className="text-xs text-muted-foreground">
              {new Date(sub.submitted_at).toLocaleString()}
            </span>
          </div>
          {sub.status === "graded" && sub.score !== null && (
            <p className="text-lg font-bold">
              {markLabel(Number(sub.score), work.max_points)}
            </p>
          )}
          {sub.feedback && (
            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
              <span className="font-medium">Teacher: </span>
              {sub.feedback}
            </p>
          )}
          {sub.answer_text && (
            <p className="whitespace-pre-wrap text-sm">{sub.answer_text}</p>
          )}
          {sub.file_name && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openFile}
            >
              Open {sub.file_name}
            </Button>
          )}
          {work.can_submit && (
            <div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
              >
                Change my hand-in
              </Button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="space-y-3">
          {work.allow_text && (
            <div className="space-y-1">
              <label htmlFor="asg-text" className="text-sm font-medium">
                Your answer
              </label>
              <Textarea
                id="asg-text"
                rows={8}
                maxLength={MAX_ANSWER_CHARS}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}
          {work.allow_file && (
            <div className="space-y-1">
              <label htmlFor="asg-file" className="text-sm font-medium">
                Attach a file (optional)
              </label>
              <input
                id="asg-file"
                type="file"
                className="block text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                {SUBMISSION_FORMATS_LABEL}, up to 25 MB.
                {sub?.file_name && !file
                  ? ` Your current file (${sub.file_name}) stays unless you pick another.`
                  : ""}
              </p>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={submit}>
              {busy ? "Handing in..." : sub ? "Hand in again" : "Hand in"}
            </Button>
            {sub && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
      {!showForm && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
