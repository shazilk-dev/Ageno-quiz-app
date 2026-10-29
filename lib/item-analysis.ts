import { picksMatch } from "@/lib/exam/answers";

// Per-question statistics for one quiz (admin plan A5.2), from the answer sheets of finished results. Pure:
// no Firebase, so it is unit-tested on its own and could run anywhere. The numbers are advice for the admin
// about which questions to look at, never a verdict; every figure comes with the number of results behind it.
//
// The measures are the usual ones from test analysis: the share who got a question right ("difficulty"), how
// well it separates people who did well overall from those who did badly ("discrimination", the top 27%
// against the bottom 27% by score), and how often each wrong option was picked ("distractor efficiency").

/** Fewer results than this and a percentage says nothing: the question is listed without flags. */
export const MIN_FOR_FLAGS = 10;
/** Discrimination compares small groups, so a negative value is only worth a warning with this many results. */
export const MIN_FOR_DISCRIMINATION_FLAG = 30;
/** An option nobody picks does no work as a wrong answer; judged only with this many results. */
export const MIN_FOR_DEAD_OPTION = 20;

export const VERY_HARD_BELOW = 0.3;
export const VERY_EASY_ABOVE = 0.9;
/** Below this, a question's best people did worse than its worst: the answer key may be wrong. */
export const NEGATIVE_DISCRIMINATION_BELOW = -0.1;
export const DEAD_OPTION_BELOW = 0.05;
/** Share of the ranked results compared at each end. */
export const GROUP_SHARE = 0.27;

export type InsightFlag = "very_hard" | "very_easy" | "negative_discrimination" | "dead_option";

/** A question as the quiz has it now. */
export interface InsightQuestion {
  id: string;
  /** The first line of the question, for the list. */
  label: string;
  type: "single" | "multiple";
  options: { text: string; isCorrect: boolean }[];
}

/** One finished result: its score, and its sheet (questions left unanswered are absent from it). */
export interface InsightAttempt {
  score: number | null;
  sheet: Record<string, { p?: unknown; ok?: unknown } | undefined>;
}

export interface OptionInsight {
  index: number;
  text: string;
  correct: boolean;
  /** How many results picked it. */
  picks: number;
  /** `picks` as a share of every result at this level, 0 to 1. */
  rate: number;
}

export interface QuestionInsight {
  id: string;
  /** 1-based, as in the quiz. */
  position: number;
  label: string;
  type: "single" | "multiple";
  /** Results that had this question. */
  attempts: number;
  answered: number;
  /** Null when the question has no answer key, so nothing can be right. */
  correct: number | null;
  /** Share who got it right, 0 to 1; null without a key. */
  difficulty: number | null;
  /** Top group's share right minus the bottom group's, -1 to 1; null when there are too few scored results. */
  discrimination: number | null;
  options: OptionInsight[];
  flags: InsightFlag[];
  /** False below `MIN_FOR_FLAGS` results: the figures are shown but nothing is flagged. */
  enough: boolean;
}

export interface LevelInsight {
  level: string;
  attempts: number;
  questions: QuestionInsight[];
}

export interface QuizInsights {
  quizId: string;
  /** Finished results the figures come from. */
  analysed: number;
  /** Finished results in all; more than `analysed` when only the latest were read. */
  total: number;
  levels: LevelInsight[];
  /** Questions with at least one flag, across levels. */
  flagged: number;
}

/** The picks that point at a real option; anything else (a question edited since, a bad entry) is not a pick. */
const picksOf = (entry: InsightAttempt["sheet"][string], optionCount: number): number[] =>
  entry && Array.isArray(entry.p)
    ? entry.p.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < optionCount)
    : [];

/** Right or wrong for one result: what was recorded when it was scored, else against the key as it is now. */
function wasRight(
  entry: InsightAttempt["sheet"][string],
  picks: number[],
  key: number[]
): boolean {
  if (picks.length === 0) return false;
  if (entry && typeof entry.ok === "boolean") return entry.ok;
  return picksMatch(key, picks);
}

/** The group sizes at each end of the ranking: 27% of the scored results, at least one. */
export const groupSize = (scored: number) => Math.max(1, Math.round(scored * GROUP_SHARE));

/**
 * Statistics for the questions of one level, over the results taken at that level. `attempts` should be only
 * those results. A question added after some results were taken is judged against all of them, so a quiz that
 * was changed a lot recently is best read once enough new results are in.
 */
export function analyseLevel(
  level: string,
  questions: readonly InsightQuestion[],
  attempts: readonly InsightAttempt[]
): LevelInsight {
  // Highest score first; results with no score still count towards a question's share, not its discrimination.
  const ranked = attempts
    .filter((attempt): attempt is InsightAttempt & { score: number } => typeof attempt.score === "number")
    .sort((a, b) => b.score - a.score);
  const size = groupSize(ranked.length);
  const upper = ranked.slice(0, size);
  const lower = ranked.slice(ranked.length - size);

  const insights = questions.map((question, index): QuestionInsight => {
    const key = question.options.flatMap((option, i) => (option.isCorrect ? [i] : []));
    const hasKey = key.length > 0;
    const counts = question.options.map(() => 0);
    let answered = 0;
    let correct = 0;

    for (const attempt of attempts) {
      const entry = attempt.sheet[question.id];
      const picks = picksOf(entry, counts.length);
      if (picks.length === 0) continue;
      answered += 1;
      for (const pick of new Set(picks)) counts[pick] += 1;
      if (hasKey && wasRight(entry, picks, key)) correct += 1;
    }

    const total = attempts.length;
    const enough = total >= MIN_FOR_FLAGS;
    const difficulty = hasKey && total > 0 ? correct / total : null;

    const rightShare = (group: readonly InsightAttempt[]) =>
      group.filter((attempt) => {
        const entry = attempt.sheet[question.id];
        return wasRight(entry, picksOf(entry, question.options.length), key);
      }).length / group.length;
    const discrimination =
      hasKey && ranked.length >= MIN_FOR_FLAGS ? rightShare(upper) - rightShare(lower) : null;

    const options = question.options.map(
      (option, i): OptionInsight => ({
        index: i,
        text: option.text,
        correct: option.isCorrect,
        picks: counts[i],
        rate: total > 0 ? counts[i] / total : 0,
      })
    );

    const flags: InsightFlag[] = [];
    if (hasKey && enough && difficulty !== null) {
      if (difficulty < VERY_HARD_BELOW) flags.push("very_hard");
      if (difficulty > VERY_EASY_ABOVE) flags.push("very_easy");
    }
    if (
      discrimination !== null &&
      ranked.length >= MIN_FOR_DISCRIMINATION_FLAG &&
      discrimination < NEGATIVE_DISCRIMINATION_BELOW
    ) {
      flags.push("negative_discrimination");
    }
    // A two-option question has one wrong option, and it is meant to be picked by those who don't know.
    if (
      hasKey &&
      total >= MIN_FOR_DEAD_OPTION &&
      question.options.length > 2 &&
      options.some((option) => !option.correct && option.rate < DEAD_OPTION_BELOW)
    ) {
      flags.push("dead_option");
    }

    return {
      id: question.id,
      position: index + 1,
      label: question.label,
      type: question.type,
      attempts: total,
      answered,
      correct: hasKey ? correct : null,
      difficulty,
      discrimination,
      options,
      flags,
      enough,
    };
  });

  return { level, attempts: attempts.length, questions: insights };
}

/** How many questions across the levels carry at least one flag. */
export const countFlagged = (levels: readonly LevelInsight[]): number =>
  levels.reduce((sum, level) => sum + level.questions.filter((q) => q.flags.length > 0).length, 0);

export const FLAG_LABELS: Record<InsightFlag, { label: string; hint: string }> = {
  very_hard: {
    label: "Very hard",
    hint: "Under 30% got it right. Check the wording and the key, or whether it is taught.",
  },
  very_easy: {
    label: "Very easy",
    hint: "Over 90% got it right. It does little to tell people apart.",
  },
  negative_discrimination: {
    label: "Check the key",
    hint: "People who did best overall got this wrong more often than those who did worst. The marked answer may be wrong.",
  },
  dead_option: {
    label: "Unused option",
    hint: "A wrong option was picked by under 5%. Nobody is tempted by it.",
  },
};
