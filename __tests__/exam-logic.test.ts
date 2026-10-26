// Unit tests for the exam's pure logic. No server or Firebase needed:
//   npx vitest run __tests__/exam-logic.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatClock,
  getOptionText,
  getQuestionStatus,
  isAnswered,
  picksMatch,
  secondsUntil,
  summarize,
  togglePick,
  toPicks,
} from "../lib/exam/answers";
import {
  applyEvents,
  MAX_EVENTS_PER_REQUEST,
  MAX_STORED_EVENTS,
  type IntegrityState,
} from "../lib/exam/integrity";
import {
  normalizeQuestion,
  upgradeStoredQuestion,
  type StoredQuestion,
} from "../lib/exam/normalize";
import { buildReview, reviewCorrect, upgradeResult } from "../lib/exam/review";
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
import type { AttemptState, ExamQuestion, SubmitResult } from "../lib/exam/types";

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
      type: "single",
      correct: [1],
    });
  });

  it("prefers the flags over a legacy correctIndex that disagrees", () => {
    expect(
      normalizeQuestion("1", { options: flagged(1), correctIndex: 2 }).correct
    ).toEqual([1]);
  });

  it("falls back to correctIndex when no option is flagged (legacy questions)", () => {
    expect(
      normalizeQuestion("1", { options: flagged(-1), correctIndex: 2 }).correct
    ).toEqual([2]);
  });

  it("handles options stored as bare strings, and numbered fields", () => {
    const strings = normalizeQuestion("1", { options: ["Yes", "No"], correctIndex: 0 });
    expect(strings.options).toEqual(["Yes", "No"]);
    expect(strings.correct).toEqual([0]);

    const numbered = normalizeQuestion("1", { 0: "x", 1: "y", 2: "z", correctIndex: 1 });
    expect(numbered.options).toEqual(["x", "y", "z"]);
    expect(numbered.correct).toEqual([1]);
  });

  it("has no right option when the data names none or points outside the options", () => {
    const options = flagged(-1, 1);
    expect(normalizeQuestion("1", { options }).correct).toEqual([]);
    expect(normalizeQuestion("1", { options, correctIndex: 5 }).correct).toEqual([]);
    expect(normalizeQuestion("1", { options, correctIndex: -1 }).correct).toEqual([]);
    expect(normalizeQuestion("1", { options, correctIndex: 0.5 }).correct).toEqual([]);
  });

  it("does not guess option 0 when a question has no key", () => {
    expect(normalizeQuestion("1", { options: ["a", "b"] }).correct).toEqual([]);
  });

  it("reads several right options as a select-all question, whatever the type field says", () => {
    const options = [
      { text: "a", isCorrect: true },
      { text: "b", isCorrect: false },
      { text: "c", isCorrect: true },
    ];
    expect(normalizeQuestion("1", { options, type: "multiple" })).toMatchObject({
      type: "multiple",
      correct: [0, 2],
    });
    expect(normalizeQuestion("1", { options, type: "single" })).toMatchObject({
      type: "multiple",
      correct: [0, 2],
    });
  });

  it("keeps a select-all question with one right option as select-all", () => {
    const options = [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }];
    expect(normalizeQuestion("1", { options, type: "multiple" })).toMatchObject({
      type: "multiple",
      correct: [0],
    });
  });

  it("reads the reason on each option, with blanks as null so positions line up", () => {
    const question = normalizeQuestion("1", {
      options: [
        { text: "a", isCorrect: false, rationale: "Not this." },
        { text: "b", isCorrect: true },
        { text: "c", isCorrect: false, rationale: "   " },
      ],
    });
    expect(question.rationales).toEqual(["Not this.", null, null]);
    expect(normalizeQuestion("1", { options: flagged(0) }).rationales).toBeUndefined();
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
      type: "single",
      correct: [],
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
    type: "single",
    correct: correctIndex === null ? [] : [correctIndex],
  });
  const questions = [stored("1", 1), stored("2", 0), stored("3", 2), stored("4", null)];

  it("counts correct answers against every question, answered or not", () => {
    const score = scoreAttempt({
      questions,
      answers: { "1": [1], "2": [1], "3": [] },
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
    const answers = { "1": [1], "2": [0], "3": [2] };
    expect(scoreAttempt({ questions, answers, autoCheck: true, multiplier: 1.5 }).score).toBe(100);
    const half = { "1": [1], "2": [0] };
    expect(scoreAttempt({ questions, answers: half, autoCheck: true, multiplier: 1.5 })).toMatchObject({
      rawPercent: 50,
      score: 75,
    });
    expect(scoreAttempt({ questions, answers: half, autoCheck: true, multiplier: 3 }).score).toBe(100);
  });

  it("treats a missing, tiny or broken multiplier as 1", () => {
    const answers = { "1": [1], "2": [0] };
    for (const multiplier of [0, 0.5, -2, NaN, Infinity]) {
      expect(scoreAttempt({ questions, answers, autoCheck: true, multiplier }).score).toBe(50);
    }
  });

  it("never counts an answer to a question with no key, or one outside the options as nothing", () => {
    const score = scoreAttempt({
      questions,
      answers: { "4": [0] },
      autoCheck: true,
      multiplier: 1,
    });
    expect(score).toMatchObject({ answered: 1, correct: 0, score: 0 });
  });

  it("still scores an attempt whose answers were stored as a single number or null", () => {
    const score = scoreAttempt({
      questions,
      answers: { "1": 1, "2": 1, "3": null },
      autoCheck: true,
      multiplier: 1,
    });
    expect(score).toMatchObject({ answered: 2, correct: 1, score: 25 });
  });

  it("counts a pick outside the options as answered and wrong", () => {
    const score = scoreAttempt({ questions, answers: { "1": [7] }, autoCheck: true, multiplier: 1 });
    expect(score).toMatchObject({ answered: 1, correct: 0, isCorrect: { "1": false } });
  });

  describe("select-all questions (all or nothing)", () => {
    const multi: StoredQuestion = {
      id: "m",
      text: "m",
      options: ["a", "b", "c", "d"],
      type: "multiple",
      correct: [0, 2],
    };
    const score = (picks: number[] | undefined) =>
      scoreAttempt({
        questions: [multi],
        answers: picks ? { m: picks } : {},
        autoCheck: true,
        multiplier: 1,
      });

    it("is right only when the picks equal the right set, in any order", () => {
      expect(score([0, 2])).toMatchObject({ correct: 1, score: 100, isCorrect: { m: true } });
      expect(score([2, 0])).toMatchObject({ correct: 1 });
    });

    it("is wrong for a missing pick, an extra pick, a wrong pick, or all of them", () => {
      expect(score([0])).toMatchObject({ answered: 1, correct: 0, isCorrect: { m: false } });
      expect(score([0, 2, 3])).toMatchObject({ answered: 1, correct: 0 });
      expect(score([1, 3])).toMatchObject({ correct: 0 });
      expect(score([0, 1, 2, 3])).toMatchObject({ correct: 0 });
    });

    it("counts a duplicated pick once", () => {
      expect(score([0, 0, 2])).toMatchObject({ correct: 1 });
    });

    it("counts no picks as unanswered", () => {
      expect(score([])).toMatchObject({ answered: 0, correct: 0, isCorrect: {} });
      expect(score(undefined)).toMatchObject({ answered: 0 });
    });

    it("does not let a single-answer question take two picks", () => {
      const single: StoredQuestion = { ...multi, type: "single", correct: [0] };
      const result = scoreAttempt({
        questions: [single],
        answers: { m: [0, 2] },
        autoCheck: true,
        multiplier: 1,
      });
      expect(result).toMatchObject({ answered: 1, correct: 1 });
    });
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
      scoreAttempt({ questions, answers: { "1": [1] }, autoCheck: false, multiplier: 2 })
    ).toMatchObject({ graded: false, score: null, correct: null, rawPercent: null, answered: 1 });
  });

  it("rounds the weighted score once, from the unrounded raw share", () => {
    // 1 of 3 correct = 33.33…%; times 1.5 is 50, not 33 * 1.5 = 49.5 -> 50 by luck, so use 2: 66.67 -> 67.
    const three = [stored("1", 0), stored("2", 0), stored("3", 0)];
    expect(scoreAttempt({ questions: three, answers: { "1": [0] }, autoCheck: true, multiplier: 2 })).toMatchObject({
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
    type: "single" as const,
  }));

  it("classifies answers once the right options are known", () => {
    expect(getQuestionStatus([1], [1])).toBe("correct");
    expect(getQuestionStatus([1], [0])).toBe("incorrect");
    expect(getQuestionStatus([1], [])).toBe("unanswered");
    expect(getQuestionStatus([1], null)).toBe("unanswered");
    expect(getQuestionStatus([1], undefined)).toBe("unanswered");
    // A pick of option 0 is an answer, not "empty".
    expect(getQuestionStatus([1], [0])).not.toBe("unanswered");
    // No answer key: nothing can be right.
    expect(getQuestionStatus([], [0])).toBe("incorrect");
  });

  it("is right for a select-all question only on an exact match", () => {
    expect(getQuestionStatus([0, 2], [2, 0])).toBe("correct");
    expect(getQuestionStatus([0, 2], [0])).toBe("incorrect");
    expect(getQuestionStatus([0, 2], [0, 1, 2])).toBe("incorrect");
    expect(picksMatch([0, 2], [0, 2])).toBe(true);
    expect(picksMatch([], [])).toBe(false);
  });

  it("falls back to a label for an option with no text", () => {
    expect(getOptionText("Yes", 0)).toBe("Yes");
    expect(getOptionText("", 1)).toBe("Option 2");
  });

  it("counts answered, unanswered and flagged, with positions", () => {
    const summary = summarize(
      questions,
      { "1": [1], "2": [0], "3": [] },
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

  it("counts a select-all question as answered once it has any pick", () => {
    expect(summarize(questions, { "1": [0, 2] }, {}).answered).toBe(1);
    expect(isAnswered([])).toBe(false);
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered([0])).toBe(true);
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
      { id: "1", text: "one", options: ["a", "b"], type: "single" },
      { id: "2", text: "two", options: ["a", "b"], type: "single" },
    ],
    answers: { "1": [1], "2": [] },
    flagged: {},
    index: 0,
    tabSwitches: 1,
    blurs: 0,
    fullscreenExits: 0,
    eventSeq: 4,
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
      answers: { "1": [1], "2": [] },
      flagged: {},
      index: 0,
      tabSwitches: 1,
      blurs: 0,
      fullscreenExits: 0,
      eventSeq: 4,
      pendingEvents: [],
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
      answers: { "1": [1], "2": [0] },
      flagged: { "2": true },
      index: 1,
      tabSwitches: 0,
      fullscreenExits: 3,
      blurs: 2,
      eventSeq: 7,
      pendingEvents: [{ seq: 7, type: "window_blur", at: 5 }],
      savedAt: 0,
    };
    const { progress } = seedFromServer(state, { local, resume: true, receivedAt: 1_005_000 });
    expect(progress).toEqual({
      answers: { "1": [1], "2": [0] },
      flagged: { "2": true },
      index: 1,
      tabSwitches: 1,
      blurs: 2,
      fullscreenExits: 3,
      eventSeq: 7,
      pendingEvents: [{ seq: 7, type: "window_blur", at: 5 }],
    });
  });

  it("ignores a saved copy of a different attempt", () => {
    const other = { attemptId: "zzz", answers: { "1": [0] } } as unknown as SavedAttempt;
    expect(
      seedFromServer(state, { local: other, resume: true, receivedAt: 1_005_000 }).progress?.answers
    ).toEqual({ "1": [1], "2": [] });
  });
});

describe("applyEvents (integrity events, counted on the server)", () => {
  const empty: IntegrityState = {
    events: [],
    eventSeq: 0,
    tabSwitches: 0,
    blurs: 0,
    fullscreenExits: 0,
  };
  const event = (seq: number, type: string, at = 100) => ({ seq, type, at });

  it("counts each kind from the events and stamps them with the server's time", () => {
    const next = applyEvents(
      empty,
      [event(1, "tab_hidden"), event(2, "window_blur"), event(3, "tab_hidden"), event(4, "fullscreen_exit")],
      9_000
    );
    expect(next).toMatchObject({ tabSwitches: 2, blurs: 1, fullscreenExits: 1, eventSeq: 4 });
    expect(next.events).toEqual([
      { seq: 1, type: "tab_hidden", at: 9_000, clientAt: 100 },
      { seq: 2, type: "window_blur", at: 9_000, clientAt: 100 },
      { seq: 3, type: "tab_hidden", at: 9_000, clientAt: 100 },
      { seq: 4, type: "fullscreen_exit", at: 9_000, clientAt: 100 },
    ]);
  });

  it("ignores an event it already has, so a resend after a dropped connection counts once", () => {
    const first = applyEvents(empty, [event(1, "tab_hidden"), event(2, "tab_hidden")], 1);
    const again = applyEvents(first, [event(1, "tab_hidden"), event(2, "tab_hidden"), event(3, "window_blur")], 2);
    expect(again).toMatchObject({ tabSwitches: 2, blurs: 1, eventSeq: 3 });
    expect(again.events).toHaveLength(3);
  });

  it("takes events in sequence order whatever order they arrive in", () => {
    const next = applyEvents(empty, [event(3, "window_blur"), event(1, "tab_hidden"), event(2, "tab_hidden")], 1);
    expect(next.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(next.eventSeq).toBe(3);
  });

  it("skips malformed events and unknown types, and does not change anything for a non-list", () => {
    const next = applyEvents(
      empty,
      [null, "x", { seq: "1", type: "tab_hidden" }, { seq: 1.5, type: "tab_hidden" }, event(2, "teleport"), { type: "tab_hidden" }, event(3, "tab_hidden")],
      1
    );
    expect(next).toMatchObject({ tabSwitches: 1, eventSeq: 3 });
    expect(next.events).toHaveLength(1);
    expect(applyEvents(empty, "nonsense", 1)).toBe(empty);
    expect(applyEvents(empty, undefined, 1)).toBe(empty);
  });

  it("can't be told a count: only events move it, and it never goes down", () => {
    const state = { ...empty, tabSwitches: 5, eventSeq: 5 };
    expect(applyEvents(state, [event(2, "tab_hidden")], 1)).toMatchObject({ tabSwitches: 5 });
  });

  it("takes at most a batch per request, and keeps counting past the stored cap", () => {
    const many = Array.from({ length: MAX_EVENTS_PER_REQUEST + 50 }, (_, i) => event(i + 1, "tab_hidden"));
    expect(applyEvents(empty, many, 1).tabSwitches).toBe(MAX_EVENTS_PER_REQUEST);

    const full: IntegrityState = {
      ...empty,
      eventSeq: MAX_STORED_EVENTS,
      events: Array.from({ length: MAX_STORED_EVENTS }, (_, i) => ({
        seq: i + 1,
        type: "tab_hidden" as const,
        at: 1,
        clientAt: 1,
      })),
    };
    const past = applyEvents(full, [event(MAX_STORED_EVENTS + 1, "window_blur")], 2);
    expect(past.blurs).toBe(1);
    expect(past.events).toHaveLength(MAX_STORED_EVENTS);
  });

  it("uses 0 for a device time it can't read", () => {
    const next = applyEvents(empty, [{ seq: 1, type: "tab_hidden", at: "soon" }], 5);
    expect(next.events[0].clientAt).toBe(0);
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
    answers: { "1": [0], "2": [] },
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
    expect(loadAttempt(key)?.answers["1"]).toEqual([0]);
  });

  it("reads a copy saved before answers became lists (a number or null per question)", () => {
    const key = attemptKey("quiz1", "u1");
    store.set(key, JSON.stringify({ ...saved, answers: { "1": 0, "2": null, "3": 2 } }));
    expect(loadAttempt(key)?.answers).toEqual({ "1": [0], "2": [], "3": [2] });
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

describe("answers as lists", () => {
  it("reads any stored shape into sorted, unique, in-range picks", () => {
    expect(toPicks(null, 4)).toEqual([]);
    expect(toPicks(undefined, 4)).toEqual([]);
    expect(toPicks(2, 4)).toEqual([2]);
    expect(toPicks(0, 4)).toEqual([0]);
    expect(toPicks([3, 1, 1, 9, -1, 0.5, "2", null], 4)).toEqual([1, 3]);
    expect(toPicks("nonsense", 4)).toEqual([]);
  });

  it("keeps at most one pick for a single-answer question", () => {
    expect(toPicks([2, 1], 4, "single")).toEqual([1]);
    expect(toPicks([2, 1], 4, "multiple")).toEqual([1, 2]);
  });

  it("swaps the pick of a single-answer question and toggles one of a select-all question", () => {
    expect(togglePick([], 1, "single")).toEqual([1]);
    expect(togglePick([1], 2, "single")).toEqual([2]);
    expect(togglePick([1], 1, "single")).toEqual([1]);
    expect(togglePick(undefined, 3, "multiple")).toEqual([3]);
    expect(togglePick([3], 1, "multiple")).toEqual([1, 3]);
    expect(togglePick([1, 3], 1, "multiple")).toEqual([3]);
  });
});

describe("upgradeStoredQuestion (attempts already running when the key became a list)", () => {
  it("reads the older snapshot shape", () => {
    expect(
      upgradeStoredQuestion({
        id: "q1",
        text: "Q",
        options: ["a", "b", "c"],
        correctIndex: 2,
        explanation: "Because.",
      })
    ).toEqual({
      id: "q1",
      text: "Q",
      options: ["a", "b", "c"],
      type: "single",
      correct: [2],
      explanation: "Because.",
    });
  });

  it("reads a snapshot with no key, and one with a bad index", () => {
    expect(upgradeStoredQuestion({ id: "q", options: ["a"], correctIndex: null }).correct).toEqual([]);
    expect(upgradeStoredQuestion({ id: "q", options: ["a"], correctIndex: 4 }).correct).toEqual([]);
  });

  it("reads the current shape unchanged and cleans its key", () => {
    const current: StoredQuestion = {
      id: "q",
      text: "Q",
      options: ["a", "b", "c"],
      type: "multiple",
      correct: [0, 2],
      rationales: [null, "No.", null],
    };
    expect(upgradeStoredQuestion(current)).toEqual(current);
    expect(upgradeStoredQuestion({ ...current, correct: [2, 0, 0, 9] }).correct).toEqual([0, 2]);
  });

  it("survives junk", () => {
    expect(upgradeStoredQuestion(null)).toEqual({ id: "", text: "", options: [], type: "single", correct: [] });
  });
});

describe("review shapes", () => {
  it("reads the right options from a stored v1 review entry or a current one", () => {
    expect(reviewCorrect({ correctIndex: 1 })).toEqual([1]);
    expect(reviewCorrect({ correctIndex: null })).toEqual([]);
    expect(reviewCorrect({ correct: [2, 0] })).toEqual([0, 2]);
    expect(reviewCorrect(undefined)).toEqual([]);
  });

  const base: SubmitResult = {
    responseId: "r",
    graded: true,
    score: 50,
    rawPercent: 50,
    correct: 1,
    total: 2,
    answered: 2,
    multiplier: 1,
    timeTakenSec: 5,
    late: false,
    answers: { a: 1 as unknown as number[], b: null as unknown as number[] },
    tabSwitches: 0,
    blurs: 0,
    fullscreenExits: 0,
    review: { a: { correctIndex: 1, explanation: "Because." }, b: { correctIndex: null } } as never,
  };

  it("upgrades a whole stored result: answers as lists, review entries with `correct`", () => {
    const upgraded = upgradeResult(base, { a: 3, b: 3 });
    expect(upgraded.answers).toEqual({ a: [1], b: [] });
    expect(upgraded.review).toEqual({
      a: { correct: [1], explanation: "Because." },
      b: { correct: [] },
    });
  });

  it("leaves a result with no review without one", () => {
    expect(upgradeResult({ ...base, review: null }, {}).review).toBeNull();
  });

  it("builds a review from the questions of an attempt", () => {
    const questions: StoredQuestion[] = [
      { id: "a", text: "A", options: ["x", "y"], type: "single", correct: [1], explanation: "E", rationales: ["No.", "Yes."] },
      { id: "b", text: "B", options: ["x", "y"], type: "multiple", correct: [] },
    ];
    expect(buildReview(questions)).toEqual({
      a: { correct: [1], explanation: "E", optionRationales: ["No.", "Yes."] },
      b: { correct: [] },
    });
  });
});
