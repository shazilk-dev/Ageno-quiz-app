import {
  aggregate,
  averageOf,
  byRankKey,
  entryId,
  type QuizStat,
  type Submission,
  type TotalStat,
} from "@/lib/leaderboard-stats";

/** How many rows a board holds. Everyone is still ranked, so a person below this sees their own place. */
export const LEADERBOARD_SHOWN = 50;

interface EntryBase {
  id: string;
  rank: number;
  userId: string;
  username: string;
  completedAt: Date;
}

/** One person's best attempt at one quiz. */
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

/** The same, as the server sends it: dates as epoch ms. */
type Sent<T extends EntryBase> = Omit<T, "completedAt"> & { completedAt: number };
export type QuizEntryDTO = Sent<QuizEntry>;
export type OverallEntryDTO = Sent<OverallEntry>;

/**
 * A ranked board: the first {@link LEADERBOARD_SHOWN} entries, the signed-in person's own entry wherever
 * they are (null when they're not on it), and how many people are ranked. Every quiz: people by points;
 * one quiz: people by their best attempt.
 */
export type BoardDTO =
  | { mode: "overall"; entries: OverallEntryDTO[]; me: OverallEntryDTO | null; total: number }
  | { mode: "quiz"; entries: QuizEntryDTO[]; me: QuizEntryDTO | null; total: number };

/** A board plus quizId -> title for every quiz people can pick (the filter list). */
export type LeaderboardDTO = BoardDTO & { quizzes: Record<string, string> };

export type Leaderboard = { total: number; quizzes: Record<string, string> } & (
  | { mode: "overall"; entries: OverallEntry[]; me: OverallEntry | null }
  | { mode: "quiz"; entries: QuizEntry[]; me: QuizEntry | null }
);

const dated = <T extends { completedAt: number }>(entry: T) => ({
  ...entry,
  completedAt: new Date(entry.completedAt),
});

export function leaderboardFromDTO(data: LeaderboardDTO): Leaderboard {
  const info = { total: data.total, quizzes: data.quizzes };
  return data.mode === "overall"
    ? { ...info, mode: "overall", entries: data.entries.map(dated), me: data.me && dated(data.me) }
    : { ...info, mode: "quiz", entries: data.entries.map(dated), me: data.me && dated(data.me) };
}

/** What other people see of a person: the name they chose, or a short neutral label. Never an email. */
export const publicName = (userId: string, name: unknown): string =>
  typeof name === "string" && name.trim() ? name.trim() : `User ${userId.slice(0, 6)}`;

/** A title for how broadly someone has taken quizzes; it only reads the counts, never the scores. */
export function levelFor(quizCount: number, attempts: number): string {
  if (quizCount === 0) return "Beginner";
  if (quizCount >= 20) return "Master";
  if (quizCount >= 10) return "Expert";
  if (quizCount >= 5) return "Advanced";
  if (attempts / quizCount >= 3) return "Practiced";
  return "Beginner";
}

export const quizEntryFrom = (
  id: string,
  userId: string,
  username: string,
  stat: QuizStat,
  rank: number
): QuizEntryDTO => ({
  id,
  rank,
  userId,
  username,
  completedAt: stat.bestAt,
  score: stat.score,
  difficulty: stat.difficulty,
  timeTaken: stat.timeTakenSec,
});

export const overallEntryFrom = (
  userId: string,
  username: string,
  stat: TotalStat,
  rank: number
): OverallEntryDTO => ({
  id: `overall-${userId}`,
  rank,
  userId,
  username,
  completedAt: stat.lastAt,
  points: stat.points,
  average: averageOf(stat),
  quizCount: stat.quizCount,
  attempts: stat.attempts,
  level: levelFor(stat.quizCount, stat.attempts),
});

/** A stored result, as the boards computed from `responses` read it. */
export interface LeaderboardRow {
  userId: string;
  quizId: string;
  /** Null for a quiz the owner marks by hand: it isn't ranked. */
  score: number | null;
  selectedDifficulty: string;
  startedAt: number | null;
  submittedAt: number | null;
}

const submissions = (rows: LeaderboardRow[]): Submission[] =>
  rows.flatMap((row) =>
    typeof row.score === "number" && row.userId
      ? [
          {
            quizId: row.quizId,
            userId: row.userId,
            score: row.score,
            difficulty: row.selectedDifficulty,
            startedAt: row.startedAt,
            submittedAt: row.submittedAt ?? 0,
          },
        ]
      : []
  );

/**
 * One quiz's results ranked: each person's best attempt, higher score first, then the faster one, then the
 * earlier one. Built from the rows given (the week and month boards); the all-time board reads the same
 * thing precomputed.
 */
export function buildQuizBoard(rows: LeaderboardRow[], names: Record<string, string>): QuizEntryDTO[] {
  return aggregate(submissions(rows))
    .entries.sort(byRankKey)
    .map((entry, index) =>
      quizEntryFrom(
        entryId(entry.quizId, entry.userId),
        entry.userId,
        names[entry.userId] ?? publicName(entry.userId, null),
        entry,
        index + 1
      )
    );
}

/**
 * One entry per person. Points are the best score on each quiz added up, so they reward taking more
 * quizzes and doing better, not retaking the same one. Ties go to the higher average, then the one who
 * got there first.
 */
export function buildOverallBoard(rows: LeaderboardRow[], names: Record<string, string>): OverallEntryDTO[] {
  return aggregate(submissions(rows))
    .totals.sort(byRankKey)
    .map((total, index) =>
      overallEntryFrom(total.userId, names[total.userId] ?? publicName(total.userId, null), total, index + 1)
    );
}
