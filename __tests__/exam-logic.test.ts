// Unit tests for the exam's pure logic. No server or Firebase needed:
//   npx vitest run __tests__/exam-logic.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatClock,
  getOptionText,
  getQuestionStatus,
  secondsUntil,
  summarize,
} from "../lib/exam/answers";
import { normalizeQuestion, type StoredQuestion } from "../lib/exam/normalize";
import { scoreAttempt } from "../lib/exam/scoring";
import { seedFromServer } from "../lib/exam/seed";
import {
  attemptDeadline,
  attemptKey,
  clearAttempt,
  loadAttempt,
  saveAttempt,
  type SavedAttempt,
} from "../lib/exam/storage";
import type { AttemptState, ExamQuestion } from "../lib/exam/types";

const flagged = (correct: number, count = 3) =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i),
    text: String.fromCharCode(65 + i),
    isCorrect: i === correct,
  }));

describe("normalizeQuestion", () => {
  it("reads the option flags first (per-difficulty collections have no correctIndex)", () => {
    expect(normalizeQuestion("1", { text: "Q", options: flagged(1) })).toMatchObject({
      id: "1",
      text: "Q",
      options: ["A", "B", "C"],
      correctIndex: 1,
    });
  });

  it("prefers the flags over a legacy correctIndex that disagrees", () => {
    expect(
      normalizeQuestion("1", { options: flagged(1), correctIndex: 2 }).correctIndex
    ).toBe(1);
  });

  it("falls back to correctIndex when no option is flagged (legacy questions)", () => {
    expect(
      normalizeQuestion("1", { options: flagged(-1), correctIndex: 2 }).correctIndex
    ).toBe(2);
  });

  it("handles options stored as bare strings, and numbered fields", () => {
    const strings = normalizeQuestion("1", { options: ["Yes", "No"], correctIndex: 0 });
    expect(strings.options).toEqual(["Yes", "No"]);
    expect(strings.correctIndex).toBe(0);

    const numbered = normalizeQuestion("1", { 0: "x", 1: "y", 2: "z", correctIndex: 1 });
    expect(numbered.options).toEqual(["x", "y", "z"]);
    expect(numbered.correctIndex).toBe(1);
  });

  it("returns null when the data names no right answer or points outside the options", () => {
    const options = flagged(-1, 1);
    expect(normalizeQuestion("1", { options }).correctIndex).toBeNull();
    expect(normalizeQuestion("1", { options, correctIndex: 5 }).correctIndex).toBeNull();
    expect(normalizeQuestion("1", { options, correctIndex: -1 }).correctIndex).toBeNull();
    expect(normalizeQuestion("1", { options, correctIndex: 0.5 }).correctIndex).toBeNull();
  });

  it("does not guess option 0 when a question has no key", () => {
    expect(normalizeQuestion("1", { options: ["a", "b"] }).correctIndex).toBeNull();
  });

  it("keeps only text, options, image and explanation, and fills in blank option text", () => {
    const question = normalizeQuestion("1", {
      text: "Q",
      options: [{ text: "" }, { text: "Second" }],
      imageUrl: "https://x/y.png",
      explanation: "Because.",
      points: 5,
      secret: "nope",
    });
    expect(question).toEqual({
      id: "1",
      text: "Q",
      options: ["Option 1", "Second"],
      correctIndex: null,
      imageUrl: "https://x/y.png",
      explanation: "Because.",
    });
  });
});

describe("scoreAttempt", () => {
  const stored = (id: string, correctIndex: number | null): StoredQuestion => ({
    id,
    text: id,
    options: ["a", "b", "c"],
    correctIndex,
  });
  const questions = [stored("1", 1), stored("2", 0), stored("3", 2), stored("4", null)];

  it("counts correct answers against every question, answered or not", () => {
    const score = scoreAttempt({
      questions,
      answers: { "1": 1, "2": 1, "3": null },
      autoCheck: true,
      multiplier: 1,
    });
    expect(score).toMatchObject({
      graded: true,
      total: 4,
      answered: 2,
      correct: 1,
      rawPercent: 25,
      score: 25,
      isCorrect: { "1": true, "2": false },
    });
  });

  it("applies the difficulty multiplier and caps at 100", () => {
    const answers = { "1": 1, "2": 0, "3": 2 };
    expect(scoreAttempt({ questions, answers, autoCheck: true, multiplier: 1.5 }).score).toBe(100);
    const half = { "1": 1, "2": 0 };
    expect(scoreAttempt({ questions, answers: half, autoCheck: true, multiplier: 1.5 })).toMatchObject({
      rawPercent: 50,
      score: 75,
    });
    expect(scoreAttempt({ questions, answers: half, autoCheck: true, multiplier: 3 }).score).toBe(100);
  });

  it("treats a missing, tiny or broken multiplier as 1", () => {
    const answers = { "1": 1, "2": 0 };
    for (const multiplier of [0, 0.5, -2, NaN, Infinity]) {
      expect(scoreAttempt({ questions, answers, autoCheck: true, multiplier }).score).toBe(50);
    }
  });

  it("never counts an answer to a question with no key, or one outside the options as nothing", () => {
    const score = scoreAttempt({
      questions,
      answers: { "4": 0 },
      autoCheck: true,
      multiplier: 1,
    });
    expect(score).toMatchObject({ answered: 1, correct: 0, score: 0 });
  });

  it("scores zero for no answers and for an empty quiz", () => {
    expect(scoreAttempt({ questions, answers: {}, autoCheck: true, multiplier: 2 }).score).toBe(0);
    expect(scoreAttempt({ questions: [], answers: {}, autoCheck: true, multiplier: 1 })).toMatchObject({
      total: 0,
      score: 0,
    });
  });

  it("gives no score, no correct count and no per-question result when the quiz is checked by hand", () => {
    expect(
      scoreAttempt({ questions, answers: { "1": 1 }, autoCheck: false, multiplier: 2 })
    ).toMatchObject({ graded: false, score: null, correct: null, rawPercent: null, answered: 1 });
  });

  it("rounds the weighted score once, from the unrounded raw share", () => {
    // 1 of 3 correct = 33.33…%; times 1.5 is 50, not 33 * 1.5 = 49.5 -> 50 by luck, so use 2: 66.67 -> 67.
    const three = [stored("1", 0), stored("2", 0), stored("3", 0)];
    expect(scoreAttempt({ questions: three, answers: { "1": 0 }, autoCheck: true, multiplier: 2 })).toMatchObject({
      rawPercent: 33,
      score: 67,
    });
  });
});

describe("getQuestionStatus and summarize", () => {
  const questions: ExamQuestion[] = ["1", "2", "3", "4"].map((id) => ({
    id,
    text: id,
    options: ["a", "b", "c"],
  }));

  it("classifies answers once the right option is known", () => {
    expect(getQuestionStatus(1, 1)).toBe("correct");
    expect(getQuestionStatus(1, 0)).toBe("incorrect");
    expect(getQuestionStatus(1, null)).toBe("unanswered");
    expect(getQuestionStatus(1, undefined)).toBe("unanswered");
    // A pick of option 0 is an answer, not "empty".
    expect(getQuestionStatus(1, 0)).not.toBe("unanswered");
    // No answer key: nothing can be right.
    expect(getQuestionStatus(null, 0)).toBe("incorrect");
  });

  it("falls back to a label for an option with no text", () => {
    expect(getOptionText("Yes", 0)).toBe("Yes");
    expect(getOptionText("", 1)).toBe("Option 2");
  });

  it("counts answered, unanswered and flagged, with positions", () => {
    const summary = summarize(
      questions,
      { "1": 1, "2": 0, "3": null },
      { "2": true, "4": true }
    );
    expect(summary).toEqual({
      total: 4,
      answered: 2,
      unanswered: 2,
      flagged: 2,
      unansweredIndexes: [2, 3],
      flaggedIndexes: [1, 3],
    });
  });

  it("handles an unanswered attempt and an empty quiz", () => {
    expect(summarize(questions, {}, {}).unanswered).toBe(4);
    expect(summarize([], {}, {}).total).toBe(0);
  });
});

describe("clock helpers", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(59)).toBe("0:59");
    expect(formatClock(61)).toBe("1:01");
    expect(formatClock(30 * 60)).toBe("30:00");
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-5)).toBe("0:00");
  });

  it("works out the time left from the deadline and rounds up", () => {
    expect(secondsUntil(10_000, 0)).toBe(10);
    expect(secondsUntil(10_000, 9_001)).toBe(1);
    expect(secondsUntil(10_000, 10_000)).toBe(0);
    expect(secondsUntil(10_000, 20_000)).toBe(0);
  });
});

describe("seedFromServer", () => {
  const state: AttemptState = {
    attemptId: "a1",
    quizId: "quiz1",
    difficulty: "medium",
    durationSec: 600,
    startedAt: 1_000_000,
    deadline: 1_600_000,
    serverNow: 1_005_000,
    questions: [
      { id: "1", text: "one", options: ["a", "b"] },
      { id: "2", text: "two", options: ["a", "b"] },
    ],
    answers: { "1": 1, "2": null },
    flagged: {},
    index: 0,
    tabSwitches: 1,
    fullscreenExits: 0,
  };

  it("moves the server's start onto the device's clock, so the time allowed stays the same", () => {
    // The device clock is 2 hours fast: it reads 7_205_000 when the server says 1_005_000.
    const seed = seedFromServer(state, { receivedAt: 7_205_000 });
    expect(seed.startedAt).toBe(7_200_000);
    expect(seed.startedAt + seed.durationSec * 1000 - 7_205_000).toBe(595_000);
  });

  it("starts fresh with no saved progress", () => {
    expect(seedFromServer(state, { receivedAt: 1_005_000 }).progress).toBeUndefined();
  });

  it("resumes from the server's answers when this device has nothing newer", () => {
    expect(seedFromServer(state, { resume: true, receivedAt: 1_005_000 }).progress).toEqual({
      answers: { "1": 1, "2": null },
      flagged: {},
      index: 0,
      tabSwitches: 1,
      fullscreenExits: 0,
    });
  });

  it("prefers this device's copy for answers and position, and keeps the higher counts", () => {
    const local: SavedAttempt = {
      version: 1,
      attemptId: "a1",
      quizId: "quiz1",
      difficulty: "medium",
      startedAt: 0,
      durationSec: 600,
      questionIds: ["1", "2"],
      answers: { "1": 1, "2": 0 },
      flagged: { "2": true },
      index: 1,
      tabSwitches: 0,
      fullscreenExits: 3,
      savedAt: 0,
    };
    const { progress } = seedFromServer(state, { local, resume: true, receivedAt: 1_005_000 });
    expect(progress).toEqual({
      answers: { "1": 1, "2": 0 },
      flagged: { "2": true },
      index: 1,
      tabSwitches: 1,
      fullscreenExits: 3,
    });
  });

  it("ignores a saved copy of a different attempt", () => {
    const other = { attemptId: "zzz", answers: { "1": 0 } } as unknown as SavedAttempt;
    expect(
      seedFromServer(state, { local: other, resume: true, receivedAt: 1_005_000 }).progress?.answers
    ).toEqual({ "1": 1, "2": null });
  });
});

describe("autosave storage", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const saved: SavedAttempt = {
    version: 1,
    attemptId: "abc",
    quizId: "quiz1",
    difficulty: "hard",
    startedAt: 1_000,
    durationSec: 600,
    questionIds: ["1", "2"],
    answers: { "1": 0, "2": null },
    flagged: { "2": true },
    index: 1,
    tabSwitches: 2,
    savedAt: 2_000,
  };

  it("keys by quiz and user, with the shared ageno:quiz: prefix", () => {
    expect(attemptKey("quiz1", "u1")).toBe("ageno:quiz:attempt:quiz1:u1");
    expect(attemptKey("quiz1", null)).toBe("ageno:quiz:attempt:quiz1:guest");
    expect(attemptKey("quiz1", "u1")).not.toBe(attemptKey("quiz1", "u2"));
  });

  it("round-trips an attempt and keeps a pick of option 0", () => {
    const key = attemptKey("quiz1", "u1");
    saveAttempt(key, saved);
    expect(loadAttempt(key)).toEqual(saved);
    expect(loadAttempt(key)?.answers["1"]).toBe(0);
  });

  it("clears an attempt", () => {
    const key = attemptKey("quiz1", "u1");
    saveAttempt(key, saved);
    clearAttempt(key);
    expect(loadAttempt(key)).toBeNull();
  });

  it("ignores junk, other versions and malformed entries", () => {
    const key = attemptKey("quiz1", "u1");
    store.set(key, "not json");
    expect(loadAttempt(key)).toBeNull();
    store.set(key, JSON.stringify({ ...saved, version: 2 }));
    expect(loadAttempt(key)).toBeNull();
    store.set(key, JSON.stringify({ ...saved, durationSec: 0 }));
    expect(loadAttempt(key)).toBeNull();
    store.set(key, JSON.stringify({ ...saved, questionIds: [1, 2] }));
    expect(loadAttempt(key)).toBeNull();
    store.set(key, JSON.stringify({ ...saved, answers: null }));
    expect(loadAttempt(key)).toBeNull();
  });

  it("survives storage that throws (private windows)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadAttempt("k")).toBeNull();
    expect(() => saveAttempt("k", saved)).not.toThrow();
    expect(() => clearAttempt("k")).not.toThrow();
  });

  it("computes the deadline from the start and the limit", () => {
    expect(attemptDeadline(saved)).toBe(1_000 + 600_000);
  });
});
