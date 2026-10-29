import { describe, expect, it } from "vitest";
import {
  analyseLevel,
  countFlagged,
  groupSize,
  type InsightAttempt,
  type InsightQuestion,
} from "@/lib/item-analysis";

const single = (id: string, correct: number, options = 4): InsightQuestion => ({
  id,
  label: `Question ${id}`,
  type: "single",
  options: Array.from({ length: options }, (_, i) => ({ text: `opt ${i}`, isCorrect: i === correct })),
});

/** A result with a score and, per question, what was picked and whether it was right. */
const result = (
  score: number | null,
  picks: Record<string, number[]>,
  right: Record<string, boolean> = {}
): InsightAttempt => ({
  score,
  sheet: Object.fromEntries(
    Object.entries(picks).map(([id, p]) => [id, { p, ...(id in right ? { ok: right[id] } : {}) }])
  ),
});

/** `count` results, the first `rightCount` of them answering `pick`. */
const many = (count: number, make: (i: number) => InsightAttempt) => Array.from({ length: count }, (_, i) => make(i));

describe("difficulty and counts", () => {
  it("is the share of results that got it right, counting a skipped question as not right", () => {
    const attempts = many(20, (i) =>
      i < 12 ? result(80, { a: [1] }, { a: true }) : i < 16 ? result(40, { a: [0] }, { a: false }) : result(30, {})
    );
    const [q] = analyseLevel("easy", [single("a", 1)], attempts).questions;
    expect(q).toMatchObject({ attempts: 20, answered: 16, correct: 12, difficulty: 0.6, enough: true });
  });

  it("counts picks per option as a share of every result, and every pick of a select-all question", () => {
    const multi: InsightQuestion = {
      id: "m",
      label: "Pick two",
      type: "multiple",
      options: [true, true, false, false].map((isCorrect, i) => ({ text: `o${i}`, isCorrect })),
    };
    const attempts = many(10, (i) => result(50, { m: i < 5 ? [0, 1] : [0, 2] }));
    const [q] = analyseLevel("easy", [multi], attempts).questions;
    expect(q.options.map((o) => o.picks)).toEqual([10, 5, 5, 0]);
    expect(q.options.map((o) => o.rate)).toEqual([1, 0.5, 0.5, 0]);
    // Right only when the whole set matches, judged against the key when nothing was recorded.
    expect(q.correct).toBe(5);
  });

  it("trusts what was recorded when the result was scored over the key as it is now", () => {
    const attempts = many(10, () => result(50, { a: [0] }, { a: true }));
    const [q] = analyseLevel("easy", [single("a", 3)], attempts).questions;
    expect(q.correct).toBe(10);
  });

  it("ignores picks outside the options and a malformed sheet entry", () => {
    const attempts: InsightAttempt[] = [
      { score: 10, sheet: { a: { p: [9, -1, 1.5, "x"] } } },
      { score: 10, sheet: { a: { p: "nope" } } },
      { score: 10, sheet: {} },
    ];
    const [q] = analyseLevel("easy", [single("a", 1)], attempts).questions;
    expect(q.answered).toBe(0);
    expect(q.options.every((o) => o.picks === 0)).toBe(true);
  });

  it("has no difficulty for a question without an answer key", () => {
    const keyless: InsightQuestion = { id: "k", label: "?", type: "single", options: [{ text: "x", isCorrect: false }, { text: "y", isCorrect: false }] };
    const attempts = many(30, () => result(50, { k: [0] }));
    const [q] = analyseLevel("easy", [keyless], attempts).questions;
    expect(q).toMatchObject({ correct: null, difficulty: null, discrimination: null, flags: [] });
  });
});

describe("flags", () => {
  it("flags very hard and very easy only with enough results", () => {
    const hard = many(10, (i) => result(50, { a: [i < 2 ? 1 : 0] }, { a: i < 2 }));
    expect(analyseLevel("easy", [single("a", 1)], hard).questions[0].flags).toContain("very_hard");

    const easy = many(10, (i) => result(50, { a: [i < 10 ? 1 : 0] }, { a: true }));
    expect(analyseLevel("easy", [single("a", 1)], easy).questions[0].flags).toContain("very_easy");

    const few = many(9, () => result(50, { a: [0] }, { a: false }));
    const [q] = analyseLevel("easy", [single("a", 1)], few).questions;
    expect(q.enough).toBe(false);
    expect(q.flags).toEqual([]);
    expect(q.difficulty).toBe(0);
  });

  it("does not call a question easy at exactly 90% or hard at exactly 30%", () => {
    const ninety = many(10, (i) => result(50, { a: [1] }, { a: i < 9 }));
    expect(analyseLevel("easy", [single("a", 1)], ninety).questions[0].flags).not.toContain("very_easy");
    const thirty = many(10, (i) => result(50, { a: [1] }, { a: i < 3 }));
    expect(analyseLevel("easy", [single("a", 1)], thirty).questions[0].flags).not.toContain("very_hard");
  });

  it("measures discrimination as the top 27% minus the bottom 27% and warns when it is clearly negative", () => {
    // 40 results, scores 100 down to 61. The best people miss the question; the worst get it.
    const attempts = many(40, (i) => {
      const score = 100 - i;
      const right = i >= 20; // the lower half is right
      return result(score, { a: [right ? 1 : 0] }, { a: right });
    });
    const [q] = analyseLevel("easy", [single("a", 1)], attempts).questions;
    expect(groupSize(40)).toBe(11);
    expect(q.discrimination).toBe(-1);
    expect(q.flags).toContain("negative_discrimination");
  });

  it("is positive when the best get it right, and does not warn under 30 scored results", () => {
    const good = many(40, (i) => result(100 - i, { a: [i < 20 ? 1 : 0] }, { a: i < 20 }));
    const [q] = analyseLevel("easy", [single("a", 1)], good).questions;
    expect(q.discrimination).toBe(1);
    expect(q.flags).not.toContain("negative_discrimination");

    const small = many(20, (i) => result(100 - i, { a: [i >= 10 ? 1 : 0] }, { a: i >= 10 }));
    const [s] = analyseLevel("easy", [single("a", 1)], small).questions;
    expect(s.discrimination).toBe(-1);
    expect(s.flags).not.toContain("negative_discrimination");
  });

  it("leaves results with no score out of discrimination but not out of the counts", () => {
    const attempts = [
      ...many(10, (i) => result(90 - i, { a: [1] }, { a: true })),
      ...many(5, () => result(null, { a: [0] }, { a: false })),
    ];
    const [q] = analyseLevel("easy", [single("a", 1)], attempts).questions;
    expect(q.attempts).toBe(15);
    expect(q.difficulty).toBeCloseTo(10 / 15);
    expect(q.discrimination).toBe(0);
  });

  it("flags a wrong option nobody picks, but not on a two-option question or with few results", () => {
    // 20 results; option 3 is never picked.
    const attempts = many(20, (i) => result(50, { a: [i % 2 === 0 ? 1 : 2] }, { a: i % 2 === 0 }));
    expect(analyseLevel("easy", [single("a", 1)], attempts).questions[0].flags).toContain("dead_option");

    const trueFalse = many(20, () => result(50, { a: [1] }, { a: true }));
    expect(analyseLevel("easy", [single("a", 1, 2)], trueFalse).questions[0].flags).not.toContain("dead_option");

    const few = many(19, (i) => result(50, { a: [i % 2 === 0 ? 1 : 2] }, { a: i % 2 === 0 }));
    expect(analyseLevel("easy", [single("a", 1)], few).questions[0].flags).not.toContain("dead_option");
  });

  it("counts the questions that carry a flag", () => {
    const attempts = many(12, () => result(50, { a: [0], b: [1] }, { a: false, b: true }));
    const level = analyseLevel("easy", [single("a", 1), single("b", 1)], attempts);
    expect(level.questions.map((q) => q.flags.length > 0)).toEqual([true, true]);
    expect(countFlagged([level])).toBe(2);
  });
});

describe("edges", () => {
  it("handles a level nobody has taken", () => {
    const level = analyseLevel("hard", [single("a", 1)], []);
    expect(level.attempts).toBe(0);
    expect(level.questions[0]).toMatchObject({ attempts: 0, answered: 0, difficulty: null, discrimination: null, flags: [] });
    expect(level.questions[0].options.every((o) => o.rate === 0)).toBe(true);
  });

  it("numbers questions from 1 in quiz order and keeps the label", () => {
    const level = analyseLevel("easy", [single("a", 1), single("b", 0)], []);
    expect(level.questions.map((q) => [q.position, q.id, q.label])).toEqual([
      [1, "a", "Question a"],
      [2, "b", "Question b"],
    ]);
  });
});
