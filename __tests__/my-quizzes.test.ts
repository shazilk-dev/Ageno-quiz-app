import { describe, expect, it } from "vitest";
import { minutesSpent, personalBestId, summarizeAttempts } from "@/lib/my-quizzes";
import type { MyAttempt } from "@/lib/quizzes-api";

let n = 0;
const attempt = (score: number | null, over: Partial<MyAttempt> = {}): MyAttempt => ({
  id: `a${++n}`,
  quizId: "q",
  quizTitle: "Quiz",
  quizDescription: "",
  startedAt: new Date(2026, 9, 1, 10, 0, 0),
  submittedAt: new Date(2026, 9, 1, 10, 5, 0),
  score,
  tabSwitchCount: 0,
  fullscreenExits: 0,
  selectedDifficulty: "medium",
  hasResult: true,
  ...over,
});

describe("summarizeAttempts", () => {
  it("counts a 0% attempt in the average and the total", () => {
    const stats = summarizeAttempts([attempt(0), attempt(100)]);
    expect(stats).toMatchObject({ total: 2, average: 50, best: 100 });
  });

  it("reports a best of 0 when every score is 0, not 'no score'", () => {
    expect(summarizeAttempts([attempt(0), attempt(0)])).toMatchObject({ average: 0, best: 0 });
  });

  it("leaves unscored attempts out of the average and the best, but not the total", () => {
    const stats = summarizeAttempts([attempt(null), attempt(80), attempt(61)]);
    expect(stats).toMatchObject({ total: 3, average: 71, best: 80 });
    expect(summarizeAttempts([attempt(null)])).toMatchObject({ total: 1, average: null, best: null });
  });

  it("finds the most recent attempt whatever the order", () => {
    const later = new Date(2026, 9, 3);
    const stats = summarizeAttempts([attempt(10), attempt(20, { submittedAt: later }), attempt(30)]);
    expect(stats.lastAt).toEqual(later);
  });

  it("handles no attempts", () => {
    expect(summarizeAttempts([])).toEqual({ total: 0, average: null, best: null, lastAt: null });
  });
});

describe("minutesSpent", () => {
  it("rounds to whole minutes and never shows 0", () => {
    expect(minutesSpent(attempt(50))).toBe(5);
    const quick = attempt(50, { submittedAt: new Date(2026, 9, 1, 10, 0, 10) });
    expect(minutesSpent(quick)).toBe(1);
  });
});

describe("personalBestId", () => {
  it("marks the newest attempt with the top score (the list is newest first)", () => {
    const newest = attempt(90);
    const older = attempt(90);
    expect(personalBestId([attempt(40), newest, older])).toBe(newest.id);
  });

  it("marks nothing for a single attempt, all-zero scores or unscored ones", () => {
    expect(personalBestId([attempt(90)])).toBeNull();
    expect(personalBestId([attempt(0), attempt(0)])).toBeNull();
    expect(personalBestId([attempt(null), attempt(70)])).toBeNull();
  });
});
