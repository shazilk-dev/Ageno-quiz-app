import type { ExamQuestion } from "./types";

/** questionId -> the option indexes the person picked (sorted; `[]` while unanswered). */
export type AnswerMap = Record<string, number[]>;

/** questionIds the person flagged for review. */
export type FlagMap = Record<string, true>;

export function getOptionText(option: string | null | undefined, index: number): string {
  return option || `Option ${index + 1}`;
}

/**
 * Reads one answer in any shape it has been stored or sent in: a list of picks, or the older single
 * `number | null`. The result is sorted and unique, with every index inside the options; a `single`
 * question keeps at most its lowest pick.
 */
export function toPicks(
  value: unknown,
  optionCount: number,
  type: "single" | "multiple" = "multiple"
): number[] {
  const list = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  const picks = [
    ...new Set(
      list.filter(
        (item): item is number =>
          typeof item === "number" && Number.isInteger(item) && item >= 0 && item < optionCount
      )
    ),
  ].sort((a, b) => a - b);
  return type === "single" ? picks.slice(0, 1) : picks;
}

/** Choosing an option: a `single` question swaps its pick, a `multiple` one toggles it. */
export function togglePick(
  current: number[] | null | undefined,
  option: number,
  type: "single" | "multiple"
): number[] {
  const picks = current ?? [];
  if (type === "single") return picks.length === 1 && picks[0] === option ? picks : [option];
  return picks.includes(option)
    ? picks.filter((pick) => pick !== option)
    : [...picks, option].sort((a, b) => a - b);
}

export const isAnswered = (picks: number[] | null | undefined): boolean =>
  !!picks && picks.length > 0;

/** All-or-nothing: the picks are the right options exactly. A question with no key is never right. */
export const picksMatch = (correct: readonly number[], picks: readonly number[]): boolean =>
  correct.length > 0 &&
  picks.length === correct.length &&
  picks.every((pick) => correct.includes(pick));

export type QuestionStatus = "correct" | "incorrect" | "unanswered";

/** Only meaningful after a submit, once the server has revealed the right options. */
export function getQuestionStatus(
  correct: readonly number[],
  picks: readonly number[] | null | undefined
): QuestionStatus {
  if (!picks || picks.length === 0) return "unanswered";
  return picksMatch(correct, picks) ? "correct" : "incorrect";
}

export interface AttemptSummary {
  total: number;
  answered: number;
  unanswered: number;
  flagged: number;
  /** 0-based positions, for "jump to the first unanswered question". */
  unansweredIndexes: number[];
  flaggedIndexes: number[];
}

export function summarize(
  questions: ExamQuestion[],
  answers: AnswerMap,
  flags: FlagMap
): AttemptSummary {
  const summary: AttemptSummary = {
    total: questions.length,
    answered: 0,
    unanswered: 0,
    flagged: 0,
    unansweredIndexes: [],
    flaggedIndexes: [],
  };

  questions.forEach((question, index) => {
    if (!isAnswered(answers[question.id])) {
      summary.unanswered++;
      summary.unansweredIndexes.push(index);
    } else {
      summary.answered++;
    }
    if (flags[question.id]) {
      summary.flagged++;
      summary.flaggedIndexes.push(index);
    }
  });

  return summary;
}

/** m:ss, or h:mm:ss from an hour up. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Seconds left before `deadline` (epoch ms), rounded up so 0 means the time is really gone. */
export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
