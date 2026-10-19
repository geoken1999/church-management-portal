"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gradeAttemptAction } from "@/lib/lms/quiz-actions";
import type { WaitingAttempt } from "@/lib/lms/dal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";

// Written answers waiting for a mark. The marks are held between 0 and each question's points; the student's
// result and pass or fail follow from them.
export function GradingPanel({
  organizationId,
  attempts,
}: {
  organizationId: string;
  attempts: WaitingAttempt[];
}) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function grade(attempt: WaitingAttempt) {
    setError(null);
    const points: Record<string, number> = {};
    for (const q of attempt.written) {
      const typed = marks[attempt.id]?.[q.id];
      points[q.id] =
        typed === undefined || typed === ""
          ? 0
          : Math.min(q.points, Math.max(0, Number(typed) || 0));
    }
    startTransition(async () => {
      const result = await gradeAttemptAction(
        organizationId,
        attempt.id,
        points,
        feedback[attempt.id] ?? "",
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

  if (attempts.length === 0)
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nothing is waiting to be marked.
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-3">
      <ErrorToast message={error} />
      {attempts.map((attempt) => (
        <Card key={attempt.id}>
          <CardContent className="space-y-3">
            <div>
              <p className="font-medium">
                {attempt.studentName}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  attempt {attempt.attemptNumber}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {attempt.courseTitle} · {attempt.lessonTitle} · sent{" "}
                {new Date(attempt.submittedAt).toLocaleString()}
                {attempt.studentPhone
                  ? ` · ${attempt.studentPhone}`
                  : ""} · {attempt.autoScore} of {attempt.maxScore} points
                already marked by the system
              </p>
            </div>
            {attempt.written.map((q) => (
              <div
                key={q.id}
                className="space-y-1.5 rounded-lg bg-muted/40 p-3"
              >
                <p className="text-sm font-medium">{q.prompt}</p>
                <p className="whitespace-pre-wrap text-sm">
                  {q.answer || (
                    <span className="text-muted-foreground">
                      No answer given.
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <Input
                    type="number"
                    min={0}
                    max={q.points}
                    step="0.5"
                    className="w-24"
                    aria-label={`Marks for ${q.prompt}`}
                    value={marks[attempt.id]?.[q.id] ?? ""}
                    onChange={(e) =>
                      setMarks((m) => ({
                        ...m,
                        [attempt.id]: {
                          ...m[attempt.id],
                          [q.id]: e.target.value,
                        },
                      }))
                    }
                  />
                  out of {q.points}
                </div>
              </div>
            ))}
            <Textarea
              rows={2}
              maxLength={2000}
              placeholder="Feedback for the student (optional)"
              value={feedback[attempt.id] ?? ""}
              onChange={(e) =>
                setFeedback((f) => ({ ...f, [attempt.id]: e.target.value }))
              }
            />
            <Button
              type="button"
              disabled={pending}
              onClick={() => grade(attempt)}
            >
              Save marks
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
