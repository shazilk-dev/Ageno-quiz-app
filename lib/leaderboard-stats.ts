import { LEVELS, isLevel, type Level } from "@/lib/quiz-schema";

// The leaderboard's stored aggregates, as pure functions (no Firebase), so the submit transaction, the
// backfill script, the week/month boards and the tests all compute them the same way.
//
//   leaderboard/{quizId}_{userId}  one person on one quiz: their best attempt and their counts, overall
//                                  (top-level fields) and per level (`levels.easy`, ...)
//   userTotals/{userId}            one person across every quiz: the sum of their bests, overall and per level
//
// Both are derived data: `responses` stays the source of truth, and the backfill rebuilds both from it.
// Times are epoch ms. Each stat carries a `rankKey`, a fixed-width string that sorts (descending) in board
// order, so a board is one `orderBy(rankKey, "desc")` query and a person's place is a `count()` of the keys
// above theirs.

/** One finished, scored attempt, as the leaderboard sees it. */
export interface Submission {
  quizId: string;
  userId: string;
  score: number;
  difficulty: string;
  startedAt: number | null;
  submittedAt: number;
}

/** A person's record on one quiz (at every level, or at one level). */
export interface QuizStat {
  /** The best score, and the attempt it came from. */
  score: number;
  difficulty: string;
  timeTakenSec: number;
  bestAt: number;
  attempts: number;
  firstAt: number;
  lastAt: number;
  rankKey: string;
}

/** `leaderboard/{quizId}_{userId}`. */
export interface EntryDoc extends QuizStat {
  quizId: string;
  userId: string;
  /** The name to show, copied from the profile (kept current by the profile routes). Null: none set. */
  displayName: string | null;
  levels: Partial<Record<Level, QuizStat>>;
}

/** A person across quizzes (at every level, or at one level). */
export interface TotalStat {
  /** The sum of the best score on each quiz. */
  points: number;
  quizCount: number;
  attempts: number;
  firstAt: number;
  lastAt: number;
  rankKey: string;
}

/** `userTotals/{userId}`. */
export interface TotalsDoc extends TotalStat {
  userId: string;
  displayName: string | null;
  levels: Partial<Record<Level, TotalStat>>;
}

export const LEADERBOARD_COLLECTION = "leaderboard";
export const TOTALS_COLLECTION = "userTotals";

export const entryId = (quizId: string, userId: string) => `${quizId}_${userId}`;

/** Whole seconds between start and submit; 0 when the start is unknown (very old results). */
export const secondsBetween = (startedAt: number | null, submittedAt: number): number =>
  startedAt === null ? 0 : Math.max(0, Math.floor((submittedAt - startedAt) / 1000));

/** Average shown for a person: their points over the quizzes they took, rounded. */
export const averageOf = (stat: Pick<TotalStat, "points" | "quizCount">): number =>
  stat.quizCount > 0 ? Math.round(stat.points / stat.quizCount) : 0;

// ---- rank keys -----------------------------------------------------------------------------------------

const MAX_MS = 9_999_999_999_999; // 13 digits: past the year 2280
const MAX_SEC = 9_999_999;

/** A non-negative whole number, zero-padded to `width` digits (and capped, so the width never grows). */
const pad = (value: number, width: number) =>
  String(Math.min(10 ** width - 1, Math.max(0, Math.round(value)))).padStart(width, "0");

/** Higher score first, then the faster attempt, then the earlier one. Scores keep two decimals (older results). */
export const quizRankKey = (score: number, timeTakenSec: number, bestAt: number) =>
  `${pad(score * 100, 6)}.${pad(MAX_SEC - Math.min(timeTakenSec, MAX_SEC), 7)}.${pad(MAX_MS - bestAt, 13)}`;

/** More points first, then the higher (rounded) average, then whoever got there first. */
export const totalRankKey = (stat: Pick<TotalStat, "points" | "quizCount" | "firstAt">) =>
  `${pad(stat.points * 100, 12)}.${pad(averageOf(stat), 4)}.${pad(MAX_MS - stat.firstAt, 13)}`;

/** Sorts by rank key, best first. */
export const byRankKey = (a: { rankKey: string }, b: { rankKey: string }) =>
  a.rankKey < b.rankKey ? 1 : a.rankKey > b.rankKey ? -1 : 0;

// ---- one quiz ------------------------------------------------------------------------------------------

/** Floating-point noise from adding and taking away fractional (older) scores. */
const tidy = (value: number) => Math.round(value * 1e6) / 1e6;

/** Does this attempt beat the stored best? The same order as the rank key, so the order attempts arrive in doesn't matter. */
function beats(score: number, time: number, at: number, best: QuizStat): boolean {
  if (score !== best.score) return score > best.score;
  if (time !== best.timeTakenSec) return time < best.timeTakenSec;
  return at < best.bestAt;
}

/** A quiz stat after one more attempt. */
export function statAfter(stat: QuizStat | undefined, sub: Submission): QuizStat {
  const time = secondsBetween(sub.startedAt, sub.submittedAt);
  const best =
    !stat || beats(sub.score, time, sub.submittedAt, stat)
      ? { score: sub.score, difficulty: sub.difficulty, timeTakenSec: time, bestAt: sub.submittedAt }
      : { score: stat.score, difficulty: stat.difficulty, timeTakenSec: stat.timeTakenSec, bestAt: stat.bestAt };
  return {
    ...best,
    attempts: (stat?.attempts ?? 0) + 1,
    firstAt: Math.min(stat?.firstAt ?? Infinity, sub.submittedAt),
    lastAt: Math.max(stat?.lastAt ?? -Infinity, sub.submittedAt),
    rankKey: quizRankKey(best.score, best.timeTakenSec, best.bestAt),
  };
}

const statOf = (entry: EntryDoc): QuizStat => ({
  score: entry.score,
  difficulty: entry.difficulty,
  timeTakenSec: entry.timeTakenSec,
  bestAt: entry.bestAt,
  attempts: entry.attempts,
  firstAt: entry.firstAt,
  lastAt: entry.lastAt,
  rankKey: entry.rankKey,
});

/** A person's entry on a quiz after one more attempt. Results at a level outside `LEVELS` count overall only. */
export function entryAfter(
  entry: EntryDoc | null,
  sub: Submission,
  displayName: string | null
): EntryDoc {
  const levels = { ...(entry?.levels ?? {}) };
  if (isLevel(sub.difficulty)) levels[sub.difficulty] = statAfter(levels[sub.difficulty], sub);
  return {
    quizId: sub.quizId,
    userId: sub.userId,
    displayName,
    ...statAfter(entry ? statOf(entry) : undefined, sub),
    levels,
  };
}

// ---- across quizzes ------------------------------------------------------------------------------------

function totalOf(stats: QuizStat[]): TotalStat | null {
  if (stats.length === 0) return null;
  const total = {
    points: tidy(stats.reduce((sum, stat) => sum + stat.score, 0)),
    quizCount: stats.length,
    attempts: stats.reduce((sum, stat) => sum + stat.attempts, 0),
    firstAt: Math.min(...stats.map((stat) => stat.firstAt)),
    lastAt: Math.max(...stats.map((stat) => stat.lastAt)),
  };
  return { ...total, rankKey: totalRankKey(total) };
}

/** A person's totals worked out from all their entries; null when they have none (no totals doc). */
export function totalsFromEntries(
  userId: string,
  displayName: string | null,
  entries: EntryDoc[]
): TotalsDoc | null {
  const overall = totalOf(entries.map(statOf));
  if (!overall) return null;
  const levels: TotalsDoc["levels"] = {};
  for (const level of LEVELS) {
    const total = totalOf(entries.flatMap((entry) => entry.levels[level] ?? []));
    if (total) levels[level] = total;
  }
  return { userId, displayName, ...overall, levels };
}

/** One total after one of its quiz stats changed from `before` (none: a quiz new to this person) to `after`. */
function totalAfter(total: TotalStat | undefined, before: QuizStat | undefined, after: QuizStat): TotalStat {
  const next = {
    points: tidy((total?.points ?? 0) - (before?.score ?? 0) + after.score),
    quizCount: (total?.quizCount ?? 0) + (before ? 0 : 1),
    attempts: (total?.attempts ?? 0) - (before?.attempts ?? 0) + after.attempts,
    firstAt: Math.min(total?.firstAt ?? Infinity, after.firstAt),
    lastAt: Math.max(total?.lastAt ?? -Infinity, after.lastAt),
  };
  return { ...next, rankKey: totalRankKey(next) };
}

/**
 * Totals after a submit changed one entry, without reading the person's other entries (the submit
 * transaction reads just the two docs). Gives the same result as `totalsFromEntries` over the new entries.
 */
export function totalsAfter(
  totals: TotalsDoc | null,
  before: EntryDoc | null,
  after: EntryDoc
): TotalsDoc {
  const levels = { ...(totals?.levels ?? {}) };
  for (const level of LEVELS) {
    const stat = after.levels[level];
    if (stat) levels[level] = totalAfter(levels[level], before?.levels[level], stat);
  }
  return {
    userId: after.userId,
    displayName: after.displayName,
    ...totalAfter(totals ?? undefined, before ? statOf(before) : undefined, statOf(after)),
    levels,
  };
}

/**
 * Entries and totals for a set of results, from scratch (the backfill, and the week and month boards).
 * Results without a score (checked by hand) or without a person or quiz don't count, as before.
 */
export function aggregate(
  subs: Submission[],
  nameOf: (userId: string) => string | null = () => null
): { entries: EntryDoc[]; totals: TotalsDoc[] } {
  const entries = new Map<string, EntryDoc>();
  for (const sub of subs) {
    if (!sub.userId || !sub.quizId || !Number.isFinite(sub.score)) continue;
    const id = entryId(sub.quizId, sub.userId);
    entries.set(id, entryAfter(entries.get(id) ?? null, sub, nameOf(sub.userId)));
  }
  const byUser = new Map<string, EntryDoc[]>();
  for (const entry of entries.values()) {
    byUser.set(entry.userId, [...(byUser.get(entry.userId) ?? []), entry]);
  }
  const totals = [...byUser].flatMap(
    ([userId, list]) => totalsFromEntries(userId, nameOf(userId), list) ?? []
  );
  return { entries: [...entries.values()], totals };
}
