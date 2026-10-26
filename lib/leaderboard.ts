import type { LeaderboardRow } from "@/lib/quizzes-api";

/** How many rows the table shows. Everyone is still ranked, so a person below this can see their own place. */
export const LEADERBOARD_SHOWN = 50;

interface EntryBase {
  id: string;
  rank: number;
  userId: string;
  username: string;
  completedAt: Date;
}

/** One attempt on one quiz. */
export interface QuizEntry extends EntryBase {
  /** The score the player saw: the server's weighted score, already capped at 100. */
  score: number;
  difficulty: string;
  /** Seconds. */
  timeTaken: number;
}

/** One person across every quiz. */
export interface OverallEntry extends EntryBase {
  /** The sum, over each quiz they took, of their best score on it. Retaking a quiz can only improve it. */
  points: number;
  /** Rounded mean of those best scores. */
  average: number;
  quizCount: number;
  attempts: number;
  level: string;
}

export type LeaderboardEntry = QuizEntry | OverallEntry;

const FALLBACK_NAME = "Player";

/** A title for how broadly someone has taken quizzes; it only reads the counts, never the scores. */
export function levelFor(quizCount: number, attempts: number): string {
  if (quizCount === 0) return "Beginner";
  if (quizCount >= 20) return "Master";
  if (quizCount >= 10) return "Expert";
  if (quizCount >= 5) return "Advanced";
  if (attempts / quizCount >= 3) return "Practiced";
  return "Beginner";
}

const seconds = (row: LeaderboardRow): number =>
  row.startedAt && row.submittedAt
    ? Math.max(0, Math.floor((row.submittedAt.getTime() - row.startedAt.getTime()) / 1000))
    : 0;

/** Rows with no score (a quiz the owner marks by hand) or no person can't be ranked. */
const rankable = (row: LeaderboardRow) => typeof row.score === "number" && row.userId !== "";

function ranked<T extends EntryBase>(sorted: T[]): T[] {
  sorted.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return sorted;
}

/**
 * Every attempt at one quiz, best score first and the faster one ahead on a tie. Ranks run over all of
 * them; show the first {@link LEADERBOARD_SHOWN}.
 */
export function buildQuizBoard(
  rows: LeaderboardRow[],
  users: Record<string, string>
): QuizEntry[] {
  const entries: QuizEntry[] = rows.filter(rankable).map((row) => ({
    id: row.id,
    rank: 0,
    userId: row.userId,
    username: users[row.userId] ?? FALLBACK_NAME,
    completedAt: row.submittedAt ?? new Date(0),
    score: row.score as number,
    difficulty: row.selectedDifficulty,
    timeTaken: seconds(row),
  }));
  return ranked(entries.sort((a, b) => b.score - a.score || a.timeTaken - b.timeTaken));
}

/**
 * One entry per person. Points are the best score on each quiz added up, so they reward taking more
 * quizzes and doing better, not retaking the same one. Ties go to the higher average, then the one who
 * got there first.
 */
export function buildOverallBoard(
  rows: LeaderboardRow[],
  users: Record<string, string>
): OverallEntry[] {
  const people = new Map<
    string,
    { best: Map<string, number>; attempts: number; latest: Date; firstAt: Date }
  >();

  for (const row of rows.filter(rankable)) {
    const person = people.get(row.userId) ?? {
      best: new Map<string, number>(),
      attempts: 0,
      latest: new Date(0),
      firstAt: new Date(8.64e15),
    };
    const score = row.score as number;
    person.best.set(row.quizId, Math.max(person.best.get(row.quizId) ?? 0, score));
    person.attempts += 1;
    const at = row.submittedAt ?? new Date(0);
    if (at > person.latest) person.latest = at;
    if (at < person.firstAt) person.firstAt = at;
    people.set(row.userId, person);
  }

  const entries = [...people.entries()].map(([userId, person]) => {
    const bests = [...person.best.values()];
    const points = bests.reduce((sum, score) => sum + score, 0);
    return {
      entry: {
        id: `overall-${userId}`,
        rank: 0,
        userId,
        username: users[userId] ?? FALLBACK_NAME,
        completedAt: person.latest,
        points,
        average: Math.round(points / bests.length),
        quizCount: bests.length,
        attempts: person.attempts,
        level: levelFor(bests.length, person.attempts),
      } satisfies OverallEntry,
      firstAt: person.firstAt,
    };
  });

  return ranked(
    entries
      .sort(
        (a, b) =>
          b.entry.points - a.entry.points ||
          b.entry.average - a.entry.average ||
          a.firstAt.getTime() - b.firstAt.getTime()
      )
      .map(({ entry }) => entry)
  );
}
