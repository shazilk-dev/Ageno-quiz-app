import type { AnswerMap, FlagMap } from "./answers";
import type { ClientIntegrityEvent } from "./types";

/**
 * The copy of an attempt in progress that this device keeps, so a reload or a crashed tab doesn't lose
 * it. The attempt itself (questions, clock, answers as last autosaved) lives on the server; this is the
 * pointer to it plus the freshest answers, which the server only hears about a moment later.
 */
export interface SavedAttempt {
  version: 1;
  /** The server's attempt document id, which is also the response document id once submitted. */
  attemptId: string;
  quizId: string;
  difficulty: string;
  /** Epoch ms. The deadline is startedAt + durationSec, so the clock keeps running across reloads. */
  startedAt: number;
  durationSec: number;
  /** The questions in the order they were shown; a resume is refused if the quiz has changed. */
  questionIds: string[];
  answers: AnswerMap;
  flagged: FlagMap;
  index: number;
  tabSwitches: number;
  /** Strict exams only. Missing in attempts saved before this existed. */
  fullscreenExits?: number;
  /** Window focus lost. Missing in attempts saved before this existed. */
  blurs?: number;
  /** Where numbering of new events continues from, and the ones the server may not have yet. */
  eventSeq?: number;
  pendingEvents?: ClientIntegrityEvent[];
  savedAt: number;
}

const PREFIX = "ageno:quiz:attempt:";

export const attemptKey = (quizId: string, userId?: string | null) =>
  `${PREFIX}${quizId}:${userId || "guest"}`;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isSavedAttempt(value: unknown): value is SavedAttempt {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.attemptId === "string" &&
    typeof v.quizId === "string" &&
    typeof v.difficulty === "string" &&
    isFiniteNumber(v.startedAt) &&
    isFiniteNumber(v.durationSec) &&
    v.durationSec > 0 &&
    Array.isArray(v.questionIds) &&
    v.questionIds.every((id) => typeof id === "string") &&
    !!v.answers &&
    typeof v.answers === "object" &&
    !!v.flagged &&
    typeof v.flagged === "object" &&
    isFiniteNumber(v.index) &&
    isFiniteNumber(v.tabSwitches)
  );
}

/** Storage can be blocked or hold junk; either way there is simply no saved attempt. */
export function loadAttempt(key: string): SavedAttempt | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSavedAttempt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAttempt(key: string, attempt: SavedAttempt): void {
  try {
    localStorage.setItem(key, JSON.stringify(attempt));
  } catch {
    // Full or blocked storage: the attempt still works, it just won't survive a reload.
  }
}

export function clearAttempt(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export const attemptDeadline = (attempt: Pick<SavedAttempt, "startedAt" | "durationSec">) =>
  attempt.startedAt + attempt.durationSec * 1000;
