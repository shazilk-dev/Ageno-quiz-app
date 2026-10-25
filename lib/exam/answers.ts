import type { ExamQuestion } from "./types";

/** questionId -> the option index the person picked, or null while unanswered. */
export type AnswerMap = Record<string, number | null>;

/** questionIds the person flagged for review. */
export type FlagMap = Record<string, true>;

export function getOptionText(option: string | null | undefined, index: number): string {
  return option || `Option ${index + 1}`;
}

export type QuestionStatus = "correct" | "incorrect" | "unanswered";

/** Only meaningful after a submit, once the server has revealed the right option. */
export function getQuestionStatus(
  correctIndex: number | null,
  answer: number | null | undefined
): QuestionStatus {
  if (answer === null || answer === undefined) return "unanswered";
  return answer === correctIndex ? "correct" : "incorrect";
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
    const answer = answers[question.id];
    if (answer === null || answer === undefined) {
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
