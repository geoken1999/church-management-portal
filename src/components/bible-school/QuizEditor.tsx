"use client";

import { useEffect, useState, useTransition } from "react";
import { loadQuizAction, saveQuizAction } from "@/lib/lms/quiz-actions";
import {
  MAX_OPTIONS,
  OPTION_IDS,
  QUESTION_KINDS,
  hasQuizErrors,
  totalPoints,
  trueFalseOptions,
  validateQuiz,
  type QuestionInput,
  type QuestionKind,
  type QuizErrors,
  type QuizInput,
} from "@/lib/lms/quiz";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function blankQuestion(kind: QuestionKind = "single"): QuestionInput {
  return {
    kind,
    prompt: "",
    points: 1,
    explanation: "",
    options:
      kind === "true_false"
        ? trueFalseOptions()
        : kind === "short"
          ? []
          : [
              { id: "a", text: "", correct: true },
              { id: "b", text: "", correct: false },
            ],
  };
}

// Edits a quiz lesson: its settings and its questions. Choice questions are marked by the system; written
// answers are marked by a teacher under Grading.
export function QuizEditor({
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
  const [quiz, setQuiz] = useState<QuizInput | null>(null);
  const [locked, setLocked] = useState(false);
  const [errors, setErrors] = useState<QuizErrors>({ byQuestion: {} });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadQuizAction(organizationId, courseId, lessonId)
      .then((result) => {
        if (cancelled) return;
        if (result.error || !result.loaded)
          setError(result.error ?? "Couldn't open the quiz.");
        else {
          setQuiz(result.loaded.quiz);
          setLocked(result.loaded.locked);
        }
      })
      .catch(
        () =>
          !cancelled &&
          setError(
            "Couldn't open the quiz. Check your connection and try again.",
          ),
      );
    return () => {
      cancelled = true;
    };
  }, [organizationId, courseId, lessonId]);

  if (!quiz)
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          {error ?? "Opening the quiz..."}
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

  const update = (patch: Partial<QuizInput>) => {
    setQuiz({ ...quiz, ...patch });
    setSaved(null);
  };
  const updateQuestion = (index: number, patch: Partial<QuestionInput>) =>
    update({
      questions: quiz.questions.map((q, i) =>
        i === index ? { ...q, ...patch } : q,
      ),
    });
  const move = (index: number, by: -1 | 1) => {
    const next = [...quiz.questions];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update({ questions: next });
  };
  const changeKind = (index: number, kind: QuestionKind) => {
    const q = quiz.questions[index];
    const fresh = blankQuestion(kind);
    updateQuestion(index, {
      kind,
      options:
        kind === "single" && q.options.length >= 2 && q.kind !== "true_false"
          ? q.options.map((o, i) => ({
              ...o,
              correct: i === q.options.findIndex((x) => x.correct),
            }))
          : fresh.options,
    });
  };

  function save() {
    const found = validateQuiz(quiz!);
    setErrors(found);
    if (hasQuizErrors(found)) {
      setError("Fix the points marked below, then save again.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveQuizAction(
        organizationId,
        courseId,
        lessonId,
        quiz!,
      ).catch(
        () =>
          ({
            error: "Something went wrong. Check your connection and try again.",
          }) as { error: string; success?: boolean; errors?: QuizErrors },
      );
      if (result.errors) setErrors(result.errors);
      else if (result.error && !result.success) setError(result.error);
      else setSaved(result.error ?? "Saved.");
    });
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-4">
        <ErrorToast message={error} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            Quiz questions · {quiz.questions.length} question
            {quiz.questions.length === 1 ? "" : "s"},{" "}
            {totalPoints(quiz.questions)} points
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
        {locked && (
          <p className="rounded-md bg-muted p-2 text-sm">
            Students have already taken this quiz, so the questions can no
            longer be changed. You can still change the settings.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="quiz-pass">Pass mark (%)</Label>
            <Input
              id="quiz-pass"
              type="number"
              min={1}
              max={100}
              value={quiz.passPercent}
              onChange={(e) => update({ passPercent: Number(e.target.value) })}
            />
            {errors.passPercent && (
              <p className="text-xs text-destructive">{errors.passPercent}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-attempts">
              Attempts allowed (blank = no limit)
            </Label>
            <Input
              id="quiz-attempts"
              type="number"
              min={1}
              max={20}
              value={quiz.maxAttempts ?? ""}
              onChange={(e) =>
                update({
                  maxAttempts:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
            {errors.maxAttempts && (
              <p className="text-xs text-destructive">{errors.maxAttempts}</p>
            )}
          </div>
          <label className="mt-6 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={quiz.showAnswers}
              onChange={(e) => update({ showAnswers: e.target.checked })}
            />
            Show the right answers after an attempt is marked
          </label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quiz-instructions">Instructions (optional)</Label>
          <Textarea
            id="quiz-instructions"
            rows={2}
            value={quiz.instructions}
            maxLength={2000}
            onChange={(e) => update({ instructions: e.target.value })}
          />
        </div>

        {errors.questions && (
          <p className="text-sm text-destructive">{errors.questions}</p>
        )}
        {quiz.questions.map((q, index) => (
          <div
            key={q.id ?? `new-${index}`}
            className="space-y-3 rounded-lg border border-border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Question {index + 1}</p>
              {!locked && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === quiz.questions.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      update({
                        questions: quiz.questions.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
            <fieldset disabled={locked} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
                <Textarea
                  rows={2}
                  value={q.prompt}
                  maxLength={1000}
                  placeholder="Write the question"
                  onChange={(e) =>
                    updateQuestion(index, { prompt: e.target.value })
                  }
                />
                <div className="space-y-1">
                  <Label htmlFor={`pts-${index}`}>Points</Label>
                  <Input
                    id={`pts-${index}`}
                    type="number"
                    min={1}
                    max={100}
                    value={q.points}
                    onChange={(e) =>
                      updateQuestion(index, { points: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <select
                className={SELECT}
                value={q.kind}
                onChange={(e) =>
                  changeKind(index, e.target.value as QuestionKind)
                }
                aria-label="Kind of question"
              >
                {QUESTION_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>

              {q.kind === "true_false" && (
                <div className="flex gap-4 text-sm">
                  {q.options.map((o) => (
                    <label key={o.id} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`tf-${index}`}
                        checked={o.correct}
                        onChange={() =>
                          updateQuestion(index, {
                            options: q.options.map((x) => ({
                              ...x,
                              correct: x.id === o.id,
                            })),
                          })
                        }
                      />
                      {o.text} is correct
                    </label>
                  ))}
                </div>
              )}
              {(q.kind === "single" || q.kind === "multiple") && (
                <div className="space-y-2">
                  {q.options.map((o, oi) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <input
                        type={q.kind === "single" ? "radio" : "checkbox"}
                        name={`opt-${index}`}
                        checked={o.correct}
                        aria-label="Correct answer"
                        onChange={(e) =>
                          updateQuestion(index, {
                            options: q.options.map((x) =>
                              q.kind === "single"
                                ? { ...x, correct: x.id === o.id }
                                : x.id === o.id
                                  ? { ...x, correct: e.target.checked }
                                  : x,
                            ),
                          })
                        }
                      />
                      <Input
                        value={o.text}
                        maxLength={300}
                        placeholder={`Answer ${oi + 1}`}
                        onChange={(e) =>
                          updateQuestion(index, {
                            options: q.options.map((x) =>
                              x.id === o.id
                                ? { ...x, text: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                      {q.options.length > 2 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateQuestion(index, {
                              options: q.options.filter((x) => x.id !== o.id),
                            })
                          }
                          aria-label="Remove answer"
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  ))}
                  {q.options.length < MAX_OPTIONS && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const id =
                          OPTION_IDS.find(
                            (c) => !q.options.some((o) => o.id === c),
                          ) ?? `x${q.options.length}`;
                        updateQuestion(index, {
                          options: [
                            ...q.options,
                            { id, text: "", correct: false },
                          ],
                        });
                      }}
                    >
                      Add an answer
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {q.kind === "single"
                      ? "Tick the one correct answer."
                      : "Tick every correct answer. A student must pick exactly those to get the points."}
                  </p>
                </div>
              )}
              {q.kind === "short" && (
                <p className="text-xs text-muted-foreground">
                  Students type an answer. You mark it under Grading, and the
                  quiz result waits until you do.
                </p>
              )}
              <Input
                value={q.explanation}
                maxLength={1000}
                placeholder="Explanation shown with the right answer (optional)"
                onChange={(e) =>
                  updateQuestion(index, { explanation: e.target.value })
                }
              />
            </fieldset>
            {errors.byQuestion[index] && (
              <p className="text-xs text-destructive">
                {errors.byQuestion[index]}
              </p>
            )}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          {!locked && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                update({ questions: [...quiz.questions, blankQuestion()] })
              }
            >
              Add a question
            </Button>
          )}
          <Button type="button" disabled={pending} onClick={save}>
            {pending ? "Saving..." : "Save quiz"}
          </Button>
          {saved && (
            <span className="text-sm text-muted-foreground">{saved}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
