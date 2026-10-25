/**
 * What crosses the wire between the exam in the browser and the attempt routes. Nothing here carries
 * which option is right until the attempt has been submitted (`SubmitResult.review`).
 */

export interface ExamQuestion {
  id: string;
  text: string;
  /** Option texts, in the order they are shown. */
  options: string[];
  imageUrl?: string;
}

/** An attempt that is running, as the browser sees it. Used for both a fresh start and a resume. */
export interface AttemptState {
  attemptId: string;
  quizId: string;
  difficulty: string;
  durationSec: number;
  /** Epoch ms on the server's clock. */
  startedAt: number;
  /** Epoch ms on the server's clock. */
  deadline: number;
  /** The server's clock when it answered, so the browser can correct for a wrong local clock. */
  serverNow: number;
  questions: ExamQuestion[];
  /** questionId -> picked option index (or null), as last saved. */
  answers: Record<string, number | null>;
  flagged: Record<string, true>;
  index: number;
  tabSwitches: number;
  fullscreenExits: number;
}

export interface ReviewItem {
  /** Null when the question has no answer key; nothing counts as right then. */
  correctIndex: number | null;
  explanation?: string;
}

export interface SubmitResult {
  responseId: string;
  /** False when the quiz isn't auto-checked: there is no score or review. */
  graded: boolean;
  /** Weighted score (raw % times the difficulty multiplier, capped at 100). */
  score: number | null;
  /** Share of questions answered correctly, before the multiplier. */
  rawPercent: number | null;
  correct: number | null;
  total: number;
  answered: number;
  multiplier: number;
  /** Capped at the time limit. */
  timeTakenSec: number;
  /** The submit arrived after the deadline plus grace; what counted is the last autosave before it. */
  late: boolean;
  /** The answers that were scored (after a late submit these can differ from what the browser held). */
  answers: Record<string, number | null>;
  /** Per question; null when the quiz owner turned the review off or the quiz isn't graded. */
  review: Record<string, ReviewItem> | null;
}

export interface ProgressPatch {
  answers?: Record<string, number | null>;
  flagged?: Record<string, true>;
  index?: number;
  tabSwitches?: number;
  fullscreenExits?: number;
}

/** Questions available per difficulty level, for the lobby. */
export type QuestionCounts = Record<string, number>;

/** Where a resumed attempt picks up. */
export interface AttemptProgress {
  answers: Record<string, number | null>;
  flagged: Record<string, true>;
  index: number;
  tabSwitches: number;
  fullscreenExits: number;
}

/** Everything the exam needs to run one attempt. A fresh start, a resume and a retry are all just a seed. */
export interface AttemptSeed {
  attemptId: string;
  /** Epoch ms on this device's clock (the server's start time, corrected for clock skew). */
  startedAt: number;
  durationSec: number;
  difficulty: string;
  questions: ExamQuestion[];
  /** Present when resuming. */
  progress?: AttemptProgress;
}
