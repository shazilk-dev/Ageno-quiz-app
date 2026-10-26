import { describe, expect, it } from "vitest";
import { buildOverallBoard, buildQuizBoard, levelFor } from "@/lib/leaderboard";
import type { LeaderboardRow } from "@/lib/quizzes-api";

let n = 0;
const row = (over: Partial<LeaderboardRow> & { sec?: number; day?: number }): LeaderboardRow => {
  const { sec = 300, day = 1, ...rest } = over;
  const end = new Date(2026, 9, day, 12, 0, 0);
  return {
    id: `r${++n}`,
    userId: "u1",
    quizId: "q1",
    score: 50,
    selectedDifficulty: "medium",
    startedAt: new Date(end.getTime() - sec * 1000),
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

  it("does not weight the score a second time for hard quizzes", () => {
    const [first, second] = buildQuizBoard(
      [row({ userId: "u1", score: 70, selectedDifficulty: "hard" }), row({ userId: "u2", score: 75, selectedDifficulty: "easy" })],
      users
    );
    expect(first.username).toBe("Grace");
    expect(second.score).toBe(70);
  });

  it("leaves out rows without a score or a person, and names unknown people", () => {
    const board = buildQuizBoard(
      [row({ score: null }), row({ userId: "", score: 90 }), row({ userId: "ghost", score: 10 })],
      users
    );
    expect(board).toHaveLength(1);
    expect(board[0].username).toBe("Player");
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
    expect(ada.completedAt).toEqual(new Date(2026, 9, 9, 12));
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
