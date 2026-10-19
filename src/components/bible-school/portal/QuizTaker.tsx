"use client";

import { useCallback, useEffect, useState } from "react";
import {
  portal,
  portalError,
  type PAttempt,
  type PQuiz,
} from "@/lib/lms/portal-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

// A quiz inside a lesson. Choice questions are marked at once by the system; a written answer waits for the
// teacher. Passing completes the lesson.
export function QuizTaker({
  lessonId,
  onPassed,
}: {
  lessonId: string;
  onPassed: () => void;
}) {
  const [quiz, setQuiz] = useState<PQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[] | string>>({});
  const [taking, setTaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQuiz(await portal.quiz(lessonId));
    } catch (e) {
      setError(portalError(e, "Couldn't open this quiz."));
    }
  }, [lessonId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function submit() {
    if (!quiz) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await portal.submitQuiz(lessonId, answers);
      setTaking(false);
      setAnswers({});
      await load();
      if (attempt.passed) onPassed();
    } catch (e) {
      setError(portalError(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !quiz)
    return <p className="text-sm text-destructive">{error}</p>;
  if (!quiz)
    return <p className="text-sm text-muted-foreground">Loading the quiz...</p>;

  const attemptsLeft =
    quiz.max_attempts === null
      ? null
      : Math.max(0, quiz.max_attempts - quiz.attempts_used);

  if (taking) {
    return (
      <div className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {quiz.questions.map((q, index) => (
          <Card key={q.id}>
            <CardContent className="space-y-2">
              <p className="text-sm font-medium">
                {index + 1}. {q.prompt}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {q.points} point{q.points === 1 ? "" : "s"}
                </span>
              </p>
              {q.kind === "short" ? (
                <Textarea
                  rows={4}
                  maxLength={2000}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                  }
                  placeholder="Type your answer"
                />
              ) : (
                <div className="space-y-1.5">
                  {q.options.map((o) => {
                    const chosen =
                      (answers[q.id] as string[] | undefined) ?? [];
                    const multiple = q.kind === "multiple";
                    return (
                      <label
                        key={o.id}
                        className="flex items-start gap-2 text-sm"
                      >
                        <input
                          type={multiple ? "checkbox" : "radio"}
                          name={q.id}
                          className="mt-1"
                          checked={chosen.includes(o.id)}
                          onChange={(e) =>
                            setAnswers((a) => ({
                              ...a,
                              [q.id]: multiple
                                ? e.target.checked
                                  ? [...chosen, o.id]
                                  : chosen.filter((x) => x !== o.id)
                                : [o.id],
                            }))
                          }
                        />
                        {o.text}
                      </label>
                    );
                  })}
                  {q.kind === "multiple" && (
                    <p className="text-xs text-muted-foreground">
                      Choose every correct answer.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        <div className="flex gap-2">
          <Button type="button" disabled={busy} onClick={submit}>
            {busy ? "Sending..." : "Submit answers"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setTaking(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {quiz.instructions && (
        <p className="whitespace-pre-wrap text-sm">{quiz.instructions}</p>
      )}
      <p className="text-sm text-muted-foreground">
        {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}{" "}
        · pass mark {quiz.pass_percent}%
        {attemptsLeft !== null
          ? ` · ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left`
          : ""}
      </p>
      {quiz.passed && (
        <p className="rounded-md bg-primary/10 p-3 text-sm font-medium">
          You passed this quiz
          {quiz.best_percent !== null ? ` with ${quiz.best_percent}%` : ""}.
        </p>
      )}
      {quiz.waiting_for_teacher && (
        <p className="rounded-md bg-muted p-3 text-sm">
          Your answers are with your teacher. You will see the result here once
          they have marked them.
        </p>
      )}
      {quiz.last_attempt && (
        <AttemptResult
          attempt={quiz.last_attempt}
          passMark={quiz.pass_percent}
        />
      )}
      {quiz.can_attempt ? (
        <Button type="button" onClick={() => setTaking(true)}>
          {quiz.attempts_used === 0 ? "Start the quiz" : "Try again"}
        </Button>
      ) : !quiz.passed && !quiz.waiting_for_teacher ? (
        <p className="text-sm text-muted-foreground">
          {quiz.questions.length === 0
            ? "This quiz has no questions yet."
            : "You have used all your attempts. Ask your teacher if you need another."}
        </p>
      ) : null}
    </div>
  );
}

function AttemptResult({
  attempt,
  passMark,
}: {
  attempt: PAttempt;
  passMark: number;
}) {
  if (attempt.status === "submitted") return null;
  return (
    <Card>
      <CardContent className="space-y-2">
        <p className="text-sm font-medium">
          Attempt {attempt.attempt_number}: {attempt.percent}% ({attempt.score}{" "}
          of {attempt.max_score}){" "}
          {attempt.passed ? "· passed" : `· needs ${passMark}% to pass`}
        </p>
        {attempt.feedback && (
          <p className="whitespace-pre-wrap text-sm">
            Teacher: {attempt.feedback}
          </p>
        )}
        {attempt.detail && (
          <ul className="space-y-1.5 text-sm">
            {attempt.detail.map((d, i) => (
              <li key={d.question_id}>
                <span
                  className={
                    d.correct
                      ? "text-primary"
                      : d.correct === false
                        ? "text-destructive"
                        : ""
                  }
                >
                  {d.correct ? "✓" : d.correct === false ? "✗" : "•"}
                </span>{" "}
                {i + 1}. {d.prompt} ({d.points}/{d.max_points})
                {d.explanation ? (
                  <span className="block pl-5 text-xs text-muted-foreground">
                    {d.explanation}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
