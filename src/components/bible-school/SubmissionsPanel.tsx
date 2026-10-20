"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  gradeSubmissionAction,
  submissionFileLinkAction,
} from "@/lib/lms/assignment-actions";
import { markLabel } from "@/lib/lms/assignment";
import type { SubmissionRow } from "@/lib/lms/assignment-dal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";

// Assignment hand-ins: the ones waiting for a mark (with the student's text and file) and the latest marked
// ones, which can be marked again.
export function SubmissionsPanel({
  organizationId,
  waiting,
  marked,
}: {
  organizationId: string;
  waiting: SubmissionRow[];
  marked: SubmissionRow[];
}) {
  const router = useRouter();
  const [score, setScore] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function openFile(id: string) {
    setError(null);
    const result = await submissionFileLinkAction(organizationId, id).catch(
      () => ({ error: "Couldn't open that file." }),
    );
    if ("url" in result && result.url)
      window.open(result.url, "_blank", "noopener");
    else setError(result.error ?? "Couldn't open that file.");
  }

  function save(row: SubmissionRow) {
    setError(null);
    const typed =
      score[row.id] ?? (row.score === null ? "" : String(row.score));
    if (typed.trim() === "") {
      setError("Enter the mark first.");
      return;
    }
    startTransition(async () => {
      const result = await gradeSubmissionAction(
        organizationId,
        row.id,
        Number(typed),
        feedback[row.id] ?? row.feedback ?? "",
      ).catch(
        () =>
          ({
            error: "Something went wrong. Check your connection and try again.",
          }) as { error?: string },
      );
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const card = (row: SubmissionRow) => (
    <Card key={row.id}>
      <CardContent className="space-y-3">
        <div>
          <p className="font-medium">
            {row.studentName}
            {row.isLate && (
              <Badge variant="destructive" className="ml-2">
                Late
              </Badge>
            )}
            {row.status === "graded" && row.score !== null && (
              <Badge variant="secondary" className="ml-2">
                {markLabel(row.score, row.maxPoints)}
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.courseTitle} · {row.lessonTitle} · handed in{" "}
            {new Date(row.submittedAt).toLocaleString()}
            {row.dueAt ? ` · due ${new Date(row.dueAt).toLocaleString()}` : ""}
            {row.studentPhone ? ` · ${row.studentPhone}` : ""}
          </p>
        </div>
        {row.answerText && (
          <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">
            {row.answerText}
          </p>
        )}
        {row.fileName && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openFile(row.id)}
          >
            Open {row.fileName}
          </Button>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="number"
            min={0}
            max={row.maxPoints}
            step="0.5"
            className="w-24"
            aria-label={`Mark for ${row.studentName}`}
            value={
              score[row.id] ?? (row.score === null ? "" : String(row.score))
            }
            onChange={(e) =>
              setScore((s) => ({ ...s, [row.id]: e.target.value }))
            }
          />
          out of {row.maxPoints}
        </div>
        <Textarea
          rows={2}
          maxLength={2000}
          placeholder="Feedback for the student (optional)"
          value={feedback[row.id] ?? row.feedback ?? ""}
          onChange={(e) =>
            setFeedback((f) => ({ ...f, [row.id]: e.target.value }))
          }
        />
        <Button type="button" disabled={pending} onClick={() => save(row)}>
          {row.status === "graded" ? "Update mark" : "Save mark"}
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-3">
      <ErrorToast message={error} />
      {waiting.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No assignments are waiting to be marked.
          </CardContent>
        </Card>
      ) : (
        waiting.map(card)
      )}
      {marked.length > 0 && (
        <>
          <h3 className="pt-2 font-heading text-lg font-bold">
            Recently marked
          </h3>
          {marked.map(card)}
        </>
      )}
    </div>
  );
}
