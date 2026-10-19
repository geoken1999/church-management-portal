import { describe, expect, it } from "vitest";
import {
  gradeLetter,
  hasQuizErrors,
  totalPoints,
  trueFalseOptions,
  validateQuiz,
  type QuestionInput,
  type QuizInput,
} from "./quiz";

const single: QuestionInput = {
  kind: "single",
  prompt: "Who built the ark?",
  points: 2,
  explanation: "",
  options: [
    { id: "a", text: "Noah", correct: true },
    { id: "b", text: "Moses", correct: false },
  ],
};
const quiz = (over: Partial<QuizInput> = {}): QuizInput => ({
  passPercent: 60,
  maxAttempts: 3,
  showAnswers: true,
  instructions: "",
  questions: [single],
  ...over,
});

describe("validateQuiz", () => {
  it("accepts a normal quiz", () =>
    expect(hasQuizErrors(validateQuiz(quiz()))).toBe(false));
  it("needs a questions and sensible settings", () => {
    expect(validateQuiz(quiz({ questions: [] })).questions).toBeDefined();
    expect(validateQuiz(quiz({ passPercent: 0 })).passPercent).toBeDefined();
    expect(validateQuiz(quiz({ passPercent: 101 })).passPercent).toBeDefined();
    expect(validateQuiz(quiz({ maxAttempts: 0 })).maxAttempts).toBeDefined();
    expect(
      validateQuiz(quiz({ maxAttempts: null })).maxAttempts,
    ).toBeUndefined();
  });
  it("checks choice questions", () => {
    const bad = (q: Partial<QuestionInput>) =>
      validateQuiz(quiz({ questions: [{ ...single, ...q }] })).byQuestion[0];
    expect(bad({ prompt: " " })).toBeDefined();
    expect(bad({ points: 0 })).toBeDefined();
    expect(
      bad({ options: [{ id: "a", text: "Only", correct: true }] }),
    ).toBeDefined();
    expect(
      bad({
        options: [
          { id: "a", text: "A", correct: false },
          { id: "b", text: "B", correct: false },
        ],
      }),
    ).toMatch(/correct/);
    expect(
      bad({
        options: [
          { id: "a", text: "A", correct: true },
          { id: "b", text: "B", correct: true },
        ],
      }),
    ).toMatch(/Only one/);
    expect(
      bad({
        options: [
          { id: "a", text: "A", correct: true },
          { id: "b", text: "", correct: false },
        ],
      }),
    ).toMatch(/Fill in/);
  });
  it("allows several correct answers for a multiple choice", () => {
    const multiple: QuestionInput = {
      ...single,
      kind: "multiple",
      options: [
        { id: "a", text: "A", correct: true },
        { id: "b", text: "B", correct: true },
        { id: "c", text: "C", correct: false },
      ],
    };
    expect(hasQuizErrors(validateQuiz(quiz({ questions: [multiple] })))).toBe(
      false,
    );
  });
  it("true or false needs exactly one correct", () => {
    const tf: QuestionInput = {
      ...single,
      kind: "true_false",
      options: trueFalseOptions("false"),
    };
    expect(hasQuizErrors(validateQuiz(quiz({ questions: [tf] })))).toBe(false);
    expect(
      validateQuiz(
        quiz({
          questions: [
            {
              ...tf,
              options: [
                { id: "true", text: "True", correct: true },
                { id: "false", text: "False", correct: true },
              ],
            },
          ],
        }),
      ).byQuestion[0],
    ).toBeDefined();
  });
  it("a written answer needs only the question and points", () => {
    expect(
      hasQuizErrors(
        validateQuiz(
          quiz({ questions: [{ ...single, kind: "short", options: [] }] }),
        ),
      ),
    ).toBe(false);
  });
});

it("adds up points", () =>
  expect(totalPoints([{ points: 2 }, { points: 3 }])).toBe(5));
it("gives letters", () => {
  expect(gradeLetter(95)).toBe("A");
  expect(gradeLetter(85)).toBe("B");
  expect(gradeLetter(72)).toBe("C");
  expect(gradeLetter(60)).toBe("D");
  expect(gradeLetter(59.9)).toBe("F");
  expect(gradeLetter(null)).toBe("–");
});
