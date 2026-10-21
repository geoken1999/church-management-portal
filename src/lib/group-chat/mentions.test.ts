import { describe, expect, it } from "vitest";
import { insertMention, mentionQueryAt, splitMentions } from "./mentions";

const people = [
  { id: "a", name: "Ann" },
  { id: "al", name: "Ann Lee" },
  { id: "b", name: "Ben Carter" },
];

describe("splitMentions", () => {
  it("highlights a mention and keeps the words around it", () => {
    const parts = splitMentions("Hi @Ben Carter, are you coming?", people);
    expect(parts.map((p) => [p.text, p.mention])).toEqual([
      ["Hi ", false],
      ["@Ben Carter", true],
      [", are you coming?", false],
    ]);
  });
  it("prefers the longer name and does not cut a longer word", () => {
    expect(splitMentions("@Ann Lee hello", people)[0]).toMatchObject({ text: "@Ann Lee", mention: true });
    expect(splitMentions("@Annabel is not Ann", people).some((p) => p.mention)).toBe(false);
  });
  it("marks a mention of the reader", () => {
    expect(splitMentions("@Ann and @Ben Carter", people, "b").map((p) => p.me)).toEqual([false, false, true]);
  });
  it("leaves text alone when there is nothing to find, and copes with symbols in names", () => {
    expect(splitMentions("plain", people)).toEqual([{ text: "plain", mention: false, me: false }]);
    expect(splitMentions("@A.B (x)", [{ id: "c", name: "A.B (x)" }])[0].mention).toBe(true);
    expect(splitMentions("", people)).toEqual([{ text: "", mention: false, me: false }]);
  });
});

describe("typing a mention", () => {
  it("knows when a mention is being typed", () => {
    expect(mentionQueryAt("hello @be", 9)).toBe("be");
    expect(mentionQueryAt("@", 1)).toBe("");
    expect(mentionQueryAt("hello@be", 8)).toBeNull();
    expect(mentionQueryAt("hello @ben done", 15)).toBeNull();
  });
  it("replaces what was typed with the full name and moves the cursor after it", () => {
    expect(insertMention("hi @be", 6, "Ben Carter")).toEqual({ text: "hi @Ben Carter ", cursor: 15 });
    expect(insertMention("hi @be there", 6, "Ben Carter")).toEqual({ text: "hi @Ben Carter  there", cursor: 15 });
  });
});
