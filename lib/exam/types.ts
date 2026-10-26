/**
 * What crosses the wire between the exam in the browser and the attempt routes. Nothing here carries
 * which option is right until the attempt has been submitted (`SubmitResult.review`).
 */

import type { QuestionType } from "./normalize";

export type { QuestionType };

export interface ExamQuestion {
  id: string;
  text: string;
  /** Option texts, in the order they are shown. */
  options: string[];
  /** `single` is a radio group, `multiple` a checkbox group. */
  type: QuestionType;
  /** How many options are right, sent for `multiple` only, so the screen can say "Choose 2". */
  pickCount?: number;
  imageUrl?: string;
}

/** Things worth recording while someone takes an exam. The server counts them and stamps its own time. */
export type IntegrityEventType = "tab_hidden" | "window_blur" | "fullscreen_exit";

/** An event as the browser reports it. `seq` numbers them, so a resend is never counted twice. */
export interface ClientIntegrityEvent {
  seq: number;
  type: IntegrityEventType;
  /** The device's clock, for context only. */
  at: number;
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
  /** questionId -> picked option indexes, as last saved (`[]` while unanswered). */
  answers: Record<string, number[]>;
  flagged: Record<string, true>;
  index: number;
  /** What the server has recorded so far. */
  tabSwitches: number;
  blurs: number;
  fullscreenExits: number;
  /** The highest event number the server has accepted. */
  eventSeq: number;
}

export interface ReviewItem {
  /** The right options. Empty when the question has no answer key; nothing counts as right then. */
  correct: number[];
  explanation?: string;
  /** Why each option is right or wrong, by option position; null where nothing was written. */
  optionRationales?: (string | null)[];
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
  answers: Record<string, number[]>;
  /** What the server recorded during the attempt. */
  tabSwitches: number;
  blurs: number;
  fullscreenExits: number;
  /** Per question; null when the quiz owner turned the review off or the quiz isn't graded. */
  review: Record<string, ReviewItem> | null;
}

/** A finished attempt as the person who took it sees it again later (My quizzes -> one attempt). */
export interface AttemptResult {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  difficulty: string;
  /** Epoch ms. */
  submittedAt: number;
  /** The questions as they were during the attempt (a later edit of the quiz doesn't change them). */
  questions: ExamQuestion[];
  /** What the submit stored: score, answers and (unless the owner turned it off) the review. */
  result: SubmitResult;
}

export interface ProgressPatch {
  answers?: Record<string, number[]>;
  flagged?: Record<string, true>;
  index?: number;
  /** Events not yet reported. The server derives its counts from these, never from a number we send. */
  events?: ClientIntegrityEvent[];
}

/** Questions available per difficulty level, for the lobby. */
export type QuestionCounts = Record<string, number>;

/** Where a resumed attempt picks up. */
export interface AttemptProgress {
  answers: Record<string, number[]>;
  flagged: Record<string, true>;
  index: number;
  tabSwitches: number;
  blurs: number;
  fullscreenExits: number;
  /** Where numbering of new events continues from. */
  eventSeq: number;
  /** Events recorded on this device that the server may not have yet. */
  pendingEvents: ClientIntegrityEvent[];
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
