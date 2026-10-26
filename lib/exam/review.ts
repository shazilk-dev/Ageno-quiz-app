import type { ReviewItem, SubmitResult } from "./types";
import { cleanIndexes, type StoredQuestion } from "./normalize";
import { toPicks } from "./answers";

/**
 * The right options of a review entry, whichever shape it was stored in. Results saved before questions
 * could have several right answers hold `correctIndex: number | null`.
 */
export function reviewCorrect(item: unknown, optionCount = Number.MAX_SAFE_INTEGER): number[] {
  if (!item || typeof item !== "object") return [];
  const { correct, correctIndex } = item as { correct?: unknown; correctIndex?: unknown };
  if (Array.isArray(correct)) return cleanIndexes(correct, optionCount);
  return toPicks(correctIndex, optionCount, "single");
}

function upgradeReviewItem(item: unknown): ReviewItem {
  const { explanation, optionRationales } = (item && typeof item === "object" ? item : {}) as {
    explanation?: unknown;
    optionRationales?: unknown;
  };
  return {
    correct: reviewCorrect(item),
    ...(typeof explanation === "string" && explanation ? { explanation } : {}),
    ...(Array.isArray(optionRationales)
      ? { optionRationales: optionRationales.map((r) => (typeof r === "string" && r ? r : null)) }
      : {}),
  };
}

/**
 * A stored result in the current shape: answers as lists of picks and review entries with `correct`.
 * Everything that sends a stored result to the browser goes through this, so the screens only know one shape.
 */
export function upgradeResult(result: SubmitResult, optionCounts: Record<string, number>): SubmitResult {
  const stored = result as unknown as {
    answers?: Record<string, unknown> | null;
    review?: Record<string, unknown> | null;
  };
  const answers: Record<string, number[]> = {};
  for (const [id, value] of Object.entries(stored.answers ?? {})) {
    answers[id] = toPicks(value, optionCounts[id] ?? Number.MAX_SAFE_INTEGER);
  }
  const review = stored.review
    ? Object.fromEntries(
        Object.entries(stored.review).map(([id, item]) => [id, upgradeReviewItem(item)])
      )
    : null;
  return { ...result, answers, review };
}

/** The review for every question of an attempt, taken from its own snapshot of the questions. */
export function buildReview(questions: StoredQuestion[]): Record<string, ReviewItem> {
  return Object.fromEntries(
    questions.map((q) => [
      q.id,
      {
        correct: q.correct,
        ...(q.explanation && { explanation: q.explanation }),
        ...(q.rationales && { optionRationales: q.rationales }),
      },
    ])
  );
}
