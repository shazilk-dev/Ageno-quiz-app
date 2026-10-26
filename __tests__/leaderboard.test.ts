import { describe, expect, it } from "vitest";
import {
  buildOverallBoard,
  buildQuizBoard,
  leaderboardFromDTO,
  levelFor,
  type LeaderboardRow,
} from "@/lib/leaderboard";
import {
  aggregate,
  byRankKey,
  entryAfter,
  entryId,
  quizRankKey,
  totalRankKey,
  totalsAfter,
  totalsFromEntries,
  type EntryDoc,
  type Submission,
  type TotalsDoc,
} from "@/lib/leaderboard-stats";

const at = (day: number) => new Date(2026, 9, day, 12, 0, 0).getTime();

const row = (over: Partial<LeaderboardRow> & { sec?: number; day?: number }): LeaderboardRow => {
  const { sec = 300, day = 1, ...rest } = over;
  const end = at(day);
  return {
    userId: "u1",
    quizId: "q1",
    score: 50,
    selectedDifficulty: "medium",
    startedAt: end - sec * 1000,
    submittedAt: end,
    ...rest,
  };
};
const users = { u1: "Ada", u2: "Grace", u3: "Linus" };

describe("buildQuizBoard", () => {
  it("ranks by the stored score as it is, with the faster time ahead on a tie", () => {
    const board = buildQuizBoard(
      [
        row({ userId: "u1", score: 80, sec: 400 }),
        row({ userId: "u2", score: 95, selectedDifficulty: "hard" }),
        row({ userId: "u3", score: 80, sec: 200 }),
      ],
      users
    );
    expect(board.map((e) => [e.rank, e.username, e.score])).toEqual([
      [1, "Grace", 95],
      [2, "Linus", 80],
      [3, "Ada", 80],
    ]);
  });

  it("shows each person once, with their best attempt (and its time, level and date)", () => {
    const board = buildQuizBoard(
      [
        row({ userId: "u1", score: 60, day: 1 }),
        row({ userId: "u1", score: 90, sec: 120, selectedDifficulty: "hard", day: 3 }),
        row({ userId: "u1", score: 70, day: 5 }),
        row({ userId: "u2", score: 80 }),
      ],
      users
    );
    expect(board).toHaveLength(2);
    expect(board[0]).toMatchObject({
      username: "Ada",
      score: 90,
      timeTaken: 120,
      difficulty: "hard",
      completedAt: at(3),
    });
  });

  it("puts the earlier attempt first when score and time are equal", () => {
    const board = buildQuizBoard([row({ userId: "u1", day: 9 }), row({ userId: "u2", day: 2 })], users);
    expect(board.map((e) => e.username)).toEqual(["Grace", "Ada"]);
  });

  it("does not weight the score a second time for hard quizzes", () => {
    const [first, second] = buildQuizBoard(
      [row({ userId: "u1", score: 70, selectedDifficulty: "hard" }), row({ userId: "u2", score: 75, selectedDifficulty: "easy" })],
      users
    );
    expect(first.username).toBe("Grace");
    expect(second.score).toBe(70);
  });

  it("leaves out rows without a score or a person, and names unknown people neutrally", () => {
    const board = buildQuizBoard(
      [row({ score: null }), row({ userId: "", score: 90 }), row({ userId: "ghost-user", score: 10 })],
      users
    );
    expect(board).toHaveLength(1);
    expect(board[0].username).toBe("User ghost-");
  });

  it("keeps a time of 0 when the start is unknown", () => {
    expect(buildQuizBoard([row({ startedAt: null })], users)[0].timeTaken).toBe(0);
  });
});

describe("buildOverallBoard", () => {
  it("adds up the best score on each quiz, so retaking one quiz can't climb the board", () => {
    const board = buildOverallBoard(
      [
        // Ada: one quiz, taken 5 times.
        ...Array.from({ length: 5 }, () => row({ userId: "u1", quizId: "q1", score: 60 })),
        // Grace: two quizzes once each.
        row({ userId: "u2", quizId: "q1", score: 70 }),
        row({ userId: "u2", quizId: "q2", score: 65 }),
      ],
      users
    );
    expect(board.map((e) => [e.rank, e.username, e.points])).toEqual([
      [1, "Grace", 135],
      [2, "Ada", 60],
    ]);
    expect(board[1]).toMatchObject({ quizCount: 1, attempts: 5, average: 60 });
  });

  it("counts only the best attempt on a quiz", () => {
    const [ada] = buildOverallBoard(
      [row({ quizId: "q1", score: 40 }), row({ quizId: "q1", score: 90 }), row({ quizId: "q1", score: 70 })],
      users
    );
    expect(ada).toMatchObject({ points: 90, average: 90, quizCount: 1, attempts: 3 });
  });

  it("breaks a tie on points by the higher average, then by who got there first", () => {
    const byAverage = buildOverallBoard(
      [
        row({ userId: "u1", quizId: "q1", score: 50 }),
        row({ userId: "u1", quizId: "q2", score: 50 }),
        row({ userId: "u2", quizId: "q1", score: 100 }),
      ],
      users
    );
    expect(byAverage.map((e) => e.username)).toEqual(["Grace", "Ada"]);

    const byTime = buildOverallBoard(
      [row({ userId: "u1", score: 80, day: 5 }), row({ userId: "u2", score: 80, day: 2 })],
      users
    );
    expect(byTime.map((e) => e.username)).toEqual(["Grace", "Ada"]);
  });

  it("reports the latest activity and handles no rows", () => {
    const [ada] = buildOverallBoard([row({ day: 3 }), row({ day: 9 }), row({ day: 6 })], users);
    expect(ada.completedAt).toBe(at(9));
    expect(ada.level).toBe("Practiced");
    expect(buildOverallBoard([], users)).toEqual([]);
  });

  it("ranks everyone, not just the first 50", () => {
    const many = Array.from({ length: 60 }, (_, i) => row({ userId: `p${i}`, score: 100 - i }));
    const board = buildOverallBoard(many, {});
    expect(board).toHaveLength(60);
    expect(board[59].rank).toBe(60);
  });
});

describe("levelFor", () => {
  it("goes by how many quizzes and how many retakes", () => {
    expect(levelFor(0, 0)).toBe("Beginner");
    expect(levelFor(1, 1)).toBe("Beginner");
    expect(levelFor(2, 6)).toBe("Practiced");
    expect(levelFor(5, 5)).toBe("Advanced");
    expect(levelFor(10, 10)).toBe("Expert");
    expect(levelFor(20, 20)).toBe("Master");
  });
});

describe("rank keys", () => {
  it("sort the same way the boards compare: score, then time, then date", () => {
    const keys = [
      quizRankKey(90, 300, at(5)),
      quizRankKey(100, 900, at(5)),
      quizRankKey(90, 120, at(5)),
      quizRankKey(90, 120, at(2)),
      quizRankKey(0, 0, at(1)),
      quizRankKey(66.67, 10, at(1)),
    ];
    const sorted = keys.map((rankKey) => ({ rankKey })).sort(byRankKey).map((k) => keys.indexOf(k.rankKey));
    expect(sorted).toEqual([1, 3, 2, 0, 5, 4]);
    expect(new Set(keys.map((k) => k.length)).size).toBe(1);
  });

  it("sort totals by points, then the higher average, then the earlier start", () => {
    const a = totalRankKey({ points: 150, quizCount: 2, firstAt: at(1) }); // average 75
    const b = totalRankKey({ points: 150, quizCount: 3, firstAt: at(1) }); // average 50
    const c = totalRankKey({ points: 150, quizCount: 2, firstAt: at(4) });
    const d = totalRankKey({ points: 2000, quizCount: 20, firstAt: at(9) });
    expect([a, b, c, d].map((rankKey) => ({ rankKey })).sort(byRankKey).map((k) => k.rankKey)).toEqual([d, a, c, b]);
  });
});

// A small deterministic generator, so the property tests below are the same every run.
function random(seed: number) {
  return () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

function randomSubmissions(count: number, seed: number): Submission[] {
  const next = random(seed);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)];
  return Array.from({ length: count }, (_, i) => {
    const submittedAt = at(1) + i * 60_000;
    return {
      quizId: pick(["qa", "qb", "qc", "qd"]),
      userId: pick(["u1", "u2", "u3"]),
      // Whole scores mostly, with an older fractional one now and then; repeats make ties.
      score: next() < 0.1 ? Math.round(next() * 10_000) / 100 : pick([0, 40, 60, 60, 80, 100]),
      difficulty: pick(["easy", "medium", "hard", "basic"]),
      startedAt: next() < 0.1 ? null : submittedAt - pick([60, 120, 120, 300]) * 1000,
      submittedAt,
    };
  });
}

/** What the submit transaction does, one submit at a time: read the two docs, write the two docs. */
function live(subs: Submission[]) {
  const entries = new Map<string, EntryDoc>();
  const totals = new Map<string, TotalsDoc>();
  for (const sub of subs) {
    const id = entryId(sub.quizId, sub.userId);
    const before = entries.get(id) ?? null;
    const after = entryAfter(before, sub, null);
    entries.set(id, after);
    totals.set(sub.userId, totalsAfter(totals.get(sub.userId) ?? null, before, after));
  }
  return { entries, totals };
}

describe("the stored aggregates", () => {
  it("come out the same whether built one submit at a time (live) or from scratch (backfill)", () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const subs = randomSubmissions(120, seed);
      const { entries, totals } = live(subs);
      const built = aggregate(subs);

      expect(Object.fromEntries(entries)).toEqual(
        Object.fromEntries(built.entries.map((entry) => [entryId(entry.quizId, entry.userId), entry]))
      );
      expect(Object.fromEntries(totals)).toEqual(Object.fromEntries(built.totals.map((t) => [t.userId, t])));
      for (const total of totals.values()) {
        const own = [...entries.values()].filter((entry) => entry.userId === total.userId);
        expect(totalsFromEntries(total.userId, null, own)).toEqual(total);
      }
    }
  });

  it("don't depend on the order results arrive in", () => {
    const subs = randomSubmissions(80, 7);
    const forward = aggregate(subs);
    const backward = aggregate([...subs].reverse());
    const byId = (list: EntryDoc[]) => Object.fromEntries(list.map((e) => [entryId(e.quizId, e.userId), e]));
    expect(byId(backward.entries)).toEqual(byId(forward.entries));
  });

  it("match the boards built from the same rows", () => {
    const subs = randomSubmissions(150, 5);
    const rows: LeaderboardRow[] = subs.map((sub) => ({
      userId: sub.userId,
      quizId: sub.quizId,
      score: sub.score,
      selectedDifficulty: sub.difficulty,
      startedAt: sub.startedAt,
      submittedAt: sub.submittedAt,
    }));
    const { entries, totals } = live(subs);

    const overall = buildOverallBoard(rows, {});
    const fromTotals = [...totals.values()].sort(byRankKey);
    expect(overall.map((e) => [e.userId, e.points, e.quizCount, e.attempts])).toEqual(
      fromTotals.map((t) => [t.userId, t.points, t.quizCount, t.attempts])
    );

    // One level of one quiz: the stored per-level stat is the board over just those rows.
    const hard = buildQuizBoard(rows.filter((r) => r.quizId === "qa" && r.selectedDifficulty === "hard"), {});
    const stored = [...entries.values()]
      .filter((e) => e.quizId === "qa" && e.levels.hard)
      .map((e) => ({ userId: e.userId, ...e.levels.hard! }))
      .sort(byRankKey);
    expect(hard.map((e) => [e.userId, e.score, e.timeTaken])).toEqual(
      stored.map((s) => [s.userId, s.score, s.timeTakenSec])
    );
    // A level outside easy/medium/hard counts overall, not as a level of its own.
    expect([...entries.values()].some((e) => "basic" in e.levels)).toBe(false);
  });

  it("raise the best only when an attempt beats it, and always count the attempt", () => {
    const first = entryAfter(null, { quizId: "q", userId: "u", score: 70, difficulty: "easy", startedAt: 0, submittedAt: 100_000 }, "Ada");
    const worse = entryAfter(first, { quizId: "q", userId: "u", score: 50, difficulty: "hard", startedAt: 0, submittedAt: 200_000 }, "Ada");
    expect(worse).toMatchObject({ score: 70, difficulty: "easy", attempts: 2, firstAt: 100_000, lastAt: 200_000 });
    expect(worse.levels.hard).toMatchObject({ score: 50, attempts: 1 });

    const totals = totalsAfter(totalsAfter(null, null, first), first, worse);
    expect(totals).toMatchObject({ points: 70, quizCount: 1, attempts: 2, displayName: "Ada" });
    expect(totals.levels).toMatchObject({ easy: { points: 70, quizCount: 1 }, hard: { points: 50, quizCount: 1 } });
  });

  it("are null for someone with no entries left", () => {
    expect(totalsFromEntries("u", null, [])).toBeNull();
  });
});

describe("leaderboardFromDTO", () => {
  it("turns the server's times into dates, for the rows and the viewer's own row", () => {
    const board = leaderboardFromDTO({
      mode: "quiz",
      entries: [{ id: "e", rank: 1, userId: "u", username: "Ada", completedAt: 5_000, score: 90, difficulty: "easy", timeTaken: 60 }],
      me: { id: "m", rank: 70, userId: "me", username: "Me", completedAt: 9_000, score: 10, difficulty: "easy", timeTaken: 60 },
      total: 80,
      quizzes: {},
    });
    expect(board.entries[0].completedAt).toEqual(new Date(5_000));
    expect(board.me?.completedAt).toEqual(new Date(9_000));
    expect(board.total).toBe(80);
  });
});
