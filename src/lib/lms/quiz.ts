// Rules for building and marking quizzes. Pure, so the same rules are checked in the browser, on the server and
// in tests. The database does the real marking of student answers; the labels and checks here are for the
// teacher's screens.

export const QUESTION_KINDS = [
  { value: "single", label: "One correct answer" },
  { value: "multiple", label: "More than one correct answer" },
  { value: "true_false", label: "True or false" },
  { value: "short", label: "Written answer (you mark it)" },
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number]["value"];

export interface QuestionInput {
  /** Present for a question that already exists; a new one has none. */
  id?: string;
  kind: QuestionKind;
  prompt: string;
  points: number;
  explanation: string;
  options: { id: string; text: string; correct: boolean }[];
}

export interface QuizInput {
  passPercent: number;
  /** Blank/0 means no limit. */
  maxAttempts: number | null;
  showAnswers: boolean;
  instructions: string;
  questions: QuestionInput[];
}

export interface QuizErrors {
  passPercent?: string;
  maxAttempts?: string;
  instructions?: string;
  questions?: string;
  /** Message for a question, by its position in the list. */
  byQuestion: Record<number, string>;
}

export const MAX_QUESTIONS = 100;
export const MAX_OPTIONS = 8;

/** A fresh true-or-false question's options: the ids are fixed so students and marking agree. */
export const trueFalseOptions = (correct: "true" | "false" = "true") => [
  { id: "true", text: "True", correct: correct === "true" },
  { id: "false", text: "False", correct: correct === "false" },
];

export const OPTION_IDS = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function validateQuiz(input: QuizInput): QuizErrors {
  const errors: QuizErrors = { byQuestion: {} };
  if (
    !Number.isInteger(input.passPercent) ||
    input.passPercent < 1 ||
    input.passPercent > 100
  )
    errors.passPercent = "Enter a pass mark between 1 and 100.";
  if (
    input.maxAttempts !== null &&
    (!Number.isInteger(input.maxAttempts) ||
      input.maxAttempts < 1 ||
      input.maxAttempts > 20)
  )
    errors.maxAttempts =
      "Enter between 1 and 20 attempts, or leave blank for no limit.";
  if (input.instructions.length > 2000)
    errors.instructions = "Keep the instructions under 2000 characters.";
  if (input.questions.length === 0)
    errors.questions = "Add at least one question.";
  else if (input.questions.length > MAX_QUESTIONS)
    errors.questions = `A quiz can have at most ${MAX_QUESTIONS} questions.`;

  input.questions.forEach((q, index) => {
    const prompt = q.prompt.trim();
    if (!prompt) return void (errors.byQuestion[index] = "Write the question.");
    if (prompt.length > 1000)
      return void (errors.byQuestion[index] =
        "Keep the question under 1000 characters.");
    if (!Number.isInteger(q.points) || q.points < 1 || q.points > 100)
      return void (errors.byQuestion[index] =
        "Points must be a whole number from 1 to 100.");
    if (q.explanation.length > 1000)
      return void (errors.byQuestion[index] =
        "Keep the explanation under 1000 characters.");
    if (q.kind === "short") return;
    if (q.kind === "true_false") {
      const correct = q.options.filter((o) => o.correct);
      if (q.options.length !== 2 || correct.length !== 1)
        errors.byQuestion[index] = "Mark either True or False as correct.";
      return;
    }
    if (q.options.length < 2)
      return void (errors.byQuestion[index] = "Give at least two answers.");
    if (q.options.length > MAX_OPTIONS)
      return void (errors.byQuestion[index] =
        `Use at most ${MAX_OPTIONS} answers.`);
    if (q.options.some((o) => !o.text.trim()))
      return void (errors.byQuestion[index] =
        "Fill in every answer, or remove the empty one.");
    if (q.options.some((o) => o.text.length > 300))
      return void (errors.byQuestion[index] =
        "Keep each answer under 300 characters.");
    const right = q.options.filter((o) => o.correct).length;
    if (right === 0) errors.byQuestion[index] = "Mark the correct answer.";
    else if (q.kind === "single" && right > 1)
      errors.byQuestion[index] =
        "Only one answer can be correct for this kind of question.";
  });
  return errors;
}

export function hasQuizErrors(errors: QuizErrors): boolean {
  return (
    Boolean(
      errors.passPercent ||
      errors.maxAttempts ||
      errors.instructions ||
      errors.questions,
    ) || Object.keys(errors.byQuestion).length > 0
  );
}

/** Total points a quiz is worth. */
export const totalPoints = (questions: { points: number }[]) =>
  questions.reduce((sum, q) => sum + q.points, 0);

/** A letter for a percentage, for the gradebook and the certificate. */
export function gradeLetter(percent: number | null): string {
  if (percent === null || Number.isNaN(percent)) return "–";
  if (percent >= 90) return "A";
  if (percent >= 80) return "B";
  if (percent >= 70) return "C";
  if (percent >= 60) return "D";
  return "F";
}
