import type { LeaderboardRow } from "@/lib/quizzes-api";

export type LeaderboardEntry = {
  id: string;
  username: string;
  quizTitle: string;
  score: number;
  completedAt: Date;
  timeTaken: number; // in seconds
  rank?: number;
  quizId?: string;
  difficulty?: string;
  userId?: string;
  normalizedScore?: number; // Score adjusted for difficulty
  uniqueQuizCount?: number; // Number of unique quizzes completed
  totalAttempts?: number; // Total number of quiz attempts/completions
  masteryLevel?: string; // Calculated mastery level based on attempts
};

// Difficulty multipliers for score normalization.
// NOTE: this predates the server-side scoring and weights an already-weighted score a second time; it is
// left as it was until the leaderboard is redesigned together with the raw-vs-weighted score decision.
const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  basic: 1.0,
  medium: 1.3,
  hard: 1.6,
  "": 1.0, // Default
};

function calculateMasteryLevel(uniqueCount: number, totalAttempts: number): string {
  if (uniqueCount === 0) return "Beginner";
  const avgAttemptsPerQuiz = totalAttempts / uniqueCount;

  if (uniqueCount >= 20) return "Master";
  if (uniqueCount >= 10) return "Expert";
  if (uniqueCount >= 5) return "Advanced";
  if (avgAttemptsPerQuiz >= 3) return "Practiced";
  return "Beginner";
}

const byScoreThenTime = (a: LeaderboardEntry, b: LeaderboardEntry) => {
  if ((b.normalizedScore || 0) !== (a.normalizedScore || 0)) {
    return (b.normalizedScore || 0) - (a.normalizedScore || 0);
  }
  return a.timeTaken - b.timeTaken;
};

/**
 * Turns the server's rows into ranked entries. With no quiz chosen it is one entry per person (their
 * results added up); with a quiz chosen it is one entry per attempt. At most 50 entries.
 */
export function buildLeaderboard(
  rows: LeaderboardRow[],
  users: Record<string, string>,
  quizzes: Record<string, string>,
  category: string
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = rows.map((row) => {
    const timeTaken =
      row.startedAt && row.submittedAt
        ? Math.floor((row.submittedAt.getTime() - row.startedAt.getTime()) / 1000)
        : 0;
    const rawScore = typeof row.score === "number" ? row.score : 0;
    const multiplier = DIFFICULTY_MULTIPLIERS[row.selectedDifficulty] || 1.0;

    return {
      id: row.id,
      username: users[row.userId] ?? "Anonymous User",
      quizTitle: quizzes[row.quizId] ?? "Unknown Quiz",
      score: rawScore,
      completedAt: row.submittedAt ?? new Date(),
      timeTaken,
      quizId: row.quizId,
      difficulty: row.selectedDifficulty,
      userId: row.userId,
      normalizedScore: rawScore * multiplier,
    };
  });

  let sorted: LeaderboardEntry[];

  if (!category) {
    // Global leaderboard: one entry per person.
    const perUser = new Map<
      string,
      {
        total: number;
        count: number;
        bestTime: number;
        latest: Date;
        entries: LeaderboardEntry[];
        quizIds: Set<string>;
      }
    >();

    for (const entry of entries) {
      if (!entry.userId) continue;
      const bucket = perUser.get(entry.userId) ?? {
        total: 0,
        count: 0,
        bestTime: Infinity,
        latest: new Date(0),
        entries: [],
        quizIds: new Set<string>(),
      };
      bucket.total += entry.normalizedScore || 0;
      bucket.count += 1;
      if (entry.quizId) bucket.quizIds.add(entry.quizId);
      if (entry.timeTaken < bucket.bestTime) bucket.bestTime = entry.timeTaken;
      if (entry.completedAt > bucket.latest) bucket.latest = entry.completedAt;
      bucket.entries.push(entry);
      perUser.set(entry.userId, bucket);
    }

    const aggregated = [...perUser.entries()].map(([userId, bucket]) => {
      const mostRecent = bucket.entries.sort(
        (a, b) => b.completedAt.getTime() - a.completedAt.getTime()
      )[0];
      const uniqueQuizCount = bucket.quizIds.size;
      return {
        ...mostRecent,
        id: `global-${userId}`,
        quizTitle: `${uniqueQuizCount}/${bucket.count} completed`,
        score: Math.round(bucket.total / bucket.count),
        normalizedScore: bucket.total,
        timeTaken: bucket.bestTime,
        completedAt: bucket.latest,
        uniqueQuizCount,
        totalAttempts: bucket.count,
        masteryLevel: calculateMasteryLevel(uniqueQuizCount, bucket.count),
      };
    });
    sorted = aggregated.sort(byScoreThenTime);
  } else {
    sorted = entries.sort(byScoreThenTime);
  }

  sorted.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return sorted.slice(0, 50);
}
