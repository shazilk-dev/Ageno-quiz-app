import { picksMatch, toPicks } from "./answers";
import type { StoredQuestion } from "./normalize";

export interface ScoreInput {
  questions: StoredQuestion[];
  /**
   * questionId -> picked option indexes, `[]` or missing when unanswered. The older single `number | null`
   * is read too, so an attempt saved before answers became lists still scores.
   */
  answers: Record<string, number[] | number | null | undefined>;
  /** False for quizzes that are checked by hand: nothing is scored. */
  autoCheck: boolean;
  /** The difficulty multiplier. Anything that isn't a finite number of at least 1 counts as 1. */
  multiplier: number;
}

export interface ScoreOutput {
  graded: boolean;
  total: number;
  answered: number;
  correct: number | null;
  /** Whole percent of all questions answered correctly, before the multiplier. */
  rawPercent: number | null;
  /** Raw percent times the multiplier, rounded, capped at 100. */
  score: number | null;
  multiplier: number;
  /** questionId -> whether the answer was right (answered questions only). */
  isCorrect: Record<string, boolean>;
}

/**
 * The one scoring function; it only ever runs on the server. The denominator is every question in the
 * attempt, answered or not. A question is right when the picked set equals the right set (all or nothing,
 * so a missing or an extra pick is wrong); a pick outside the options, or a question with no key, is wrong.
 */
export function scoreAttempt({
  questions,
  answers,
  autoCheck,
  multiplier,
}: ScoreInput): ScoreOutput {
  const total = questions.length;
  const safeMultiplier =
    Number.isFinite(multiplier) && multiplier >= 1 ? multiplier : 1;

  let answered = 0;
  let correct = 0;
  const isCorrect: Record<string, boolean> = {};

  for (const question of questions) {
    const raw = answers[question.id];
    const picks = toPicks(raw, Number.MAX_SAFE_INTEGER, question.type);
    if (picks.length === 0) continue;
    answered++;
    const right = picksMatch(question.correct, picks);
    isCorrect[question.id] = right;
    if (right) correct++;
  }

  if (!autoCheck) {
    return {
      graded: false,
      total,
      answered,
      correct: null,
      rawPercent: null,
      score: null,
      multiplier: safeMultiplier,
      isCorrect,
    };
  }

  const raw = total > 0 ? (correct / total) * 100 : 0;
  return {
    graded: true,
    total,
    answered,
    correct,
    rawPercent: Math.round(raw),
    score: Math.min(100, Math.round(raw * safeMultiplier)),
    multiplier: safeMultiplier,
    isCorrect,
  };
}
