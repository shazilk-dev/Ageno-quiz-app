import type { MyAttempt } from "@/lib/quizzes-api";

export interface AttemptStats {
  total: number;
  /** Rounded mean of the scored attempts; null when none was scored. */
  average: number | null;
  best: number | null;
  /** The newest attempt, if any. */
  lastAt: Date | null;
}

/**
 * The numbers at the top of My quizzes. A score of 0% is a real score and counts; only an attempt with
 * no score at all (a quiz the owner checks by hand) is left out of the average and the best.
 */
export function summarizeAttempts(attempts: MyAttempt[]): AttemptStats {
  const scores = attempts.flatMap((a) => (a.score === null ? [] : [a.score]));
  const times = attempts.map((a) => a.submittedAt.getTime());
  return {
    total: attempts.length,
    average: scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : null,
    best: scores.length ? Math.max(...scores) : null,
    lastAt: times.length ? new Date(Math.max(...times)) : null,
  };
}

/** Whole minutes spent, never below 1 for an attempt that was submitted. */
export function minutesSpent(attempt: MyAttempt): number {
  const ms = attempt.submittedAt.getTime() - attempt.startedAt.getTime();
  return Math.max(1, Math.round(ms / 60_000));
}

/** The id of the attempt to mark as the personal best: the newest one with the top score. Needs 2+ scored attempts. */
export function personalBestId(attempts: MyAttempt[]): string | null {
  const scored = attempts.filter((a) => a.score !== null);
  if (scored.length < 2) return null;
  const best = Math.max(...scored.map((a) => a.score as number));
  if (best <= 0) return null;
  return scored.find((a) => a.score === best)?.id ?? null;
}
