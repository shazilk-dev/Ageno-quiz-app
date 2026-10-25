import { Timestamp } from "firebase-admin/firestore";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import {
  applyEvents,
  type IntegrityState,
  type StoredIntegrityEvent,
} from "@/lib/exam/integrity";
import { normalizeQuestion, type StoredQuestion } from "@/lib/exam/normalize";
import { scoreAttempt } from "@/lib/exam/scoring";
import type {
  AttemptState,
  ExamQuestion,
  ProgressPatch,
  ReviewItem,
  SubmitResult,
} from "@/lib/exam/types";
import { quizFromData } from "@/lib/quiz-data";
import {
  getDifficultyDuration,
  getDifficultyMultiplier,
} from "@/utils/difficulty-helpers";
import { accessCodeMatches } from "./quizzes";
import { ApiError, assertSafeId } from "./request";

/** Answers and the final submit are still accepted this long after the deadline (network and clock slack). */
export const SUBMIT_GRACE_MS = 30_000;
/** One attempt document holds a copy of the questions and its submit writes one doc per answer. */
export const MAX_QUESTIONS = 400;

const SAFE_LEVEL = /^[a-z]{1,20}$/;
const DEFAULT_LEVELS = ["easy", "medium", "hard"];

interface AttemptDoc {
  quizId: string;
  userId: string;
  difficulty: string;
  status: "in_progress" | "submitted" | "abandoned";
  startedAt: Timestamp;
  deadline: Timestamp;
  durationSec: number;
  /** A copy taken at the start: editing the quiz mid-attempt can't change what this attempt is scored on. */
  questions: StoredQuestion[];
  autoCheck: boolean;
  showAnswerReview: boolean;
  multiplier: number;
  answers: Record<string, number | null>;
  flagged: Record<string, true>;
  index: number;
  tabSwitches: number;
  fullscreenExits: number;
  /** Window focus lost, counted from the events below. Missing on attempts started before it existed. */
  blurs?: number;
  /** Timestamped by the server when received. Missing on attempts started before they existed. */
  events?: StoredIntegrityEvent[];
  eventSeq?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  submittedAt?: Timestamp;
  result?: SubmitResult;
}

interface Options {
  /** Epoch ms; only tests pass it. */
  now?: number;
}

/** A request body as received: every field is checked before use. */
type RawPatch = Partial<Record<keyof ProgressPatch, unknown>>;

const attempts = () => db.collection("attempts");

/** The attempt's integrity record, with defaults for attempts that predate it. */
const integrityOf = (data: AttemptDoc): IntegrityState => ({
  events: data.events ?? [],
  eventSeq: data.eventSeq ?? 0,
  tabSwitches: data.tabSwitches,
  blurs: data.blurs ?? 0,
  fullscreenExits: data.fullscreenExits,
});

/** The fields to store for an updated integrity record. */
const integrityFields = (state: IntegrityState) => ({
  events: state.events,
  eventSeq: state.eventSeq,
  tabSwitches: state.tabSwitches,
  blurs: state.blurs,
  fullscreenExits: state.fullscreenExits,
});

async function loadQuestions(
  quizId: string,
  level: string
): Promise<StoredQuestion[]> {
  const perLevel = await db.collection(`quizzes/${quizId}/questions_${level}`).get();
  // Older quizzes keep one `questions` collection for every level.
  const docs = perLevel.empty
    ? (await db.collection(`quizzes/${quizId}/questions`).get()).docs
    : perLevel.docs;
  return docs.map((doc) => normalizeQuestion(doc.id, doc.data()));
}

const toExamQuestion = (question: StoredQuestion): ExamQuestion => ({
  id: question.id,
  text: question.text,
  options: question.options,
  ...(question.imageUrl && { imageUrl: question.imageUrl }),
});

function toAttemptState(
  attemptId: string,
  data: AttemptDoc,
  now: number
): AttemptState {
  return {
    attemptId,
    quizId: data.quizId,
    difficulty: data.difficulty,
    durationSec: data.durationSec,
    startedAt: data.startedAt.toMillis(),
    deadline: data.deadline.toMillis(),
    serverNow: now,
    questions: data.questions.map(toExamQuestion),
    answers: data.answers,
    flagged: data.flagged,
    index: data.index,
    tabSwitches: data.tabSwitches,
    blurs: data.blurs ?? 0,
    fullscreenExits: data.fullscreenExits,
    eventSeq: data.eventSeq ?? 0,
  };
}

/** Only the attempt's own questions, only whole option numbers; everything else becomes "unanswered". */
function sanitizeAnswers(
  raw: unknown,
  questions: StoredQuestion[]
): Record<string, number | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(400, "invalid_answers", "Answers must be an object keyed by question.");
  }
  const input = raw as Record<string, unknown>;
  const answers: Record<string, number | null> = {};
  for (const question of questions) {
    const value = input[question.id];
    answers[question.id] =
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < question.options.length
        ? value
        : null;
  }
  return answers;
}

function sanitizeFlags(
  raw: unknown,
  questions: StoredQuestion[]
): Record<string, true> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(400, "invalid_flags", "Flags must be an object keyed by question.");
  }
  const input = raw as Record<string, unknown>;
  const flags: Record<string, true> = {};
  for (const question of questions) {
    if (input[question.id]) flags[question.id] = true;
  }
  return flags;
}

/** The attempt, if it exists and belongs to this caller. Someone else's attempt looks like a missing one. */
function owned(snap: DocumentSnapshot, userId: string): AttemptDoc {
  const data = snap.data() as AttemptDoc | undefined;
  if (!snap.exists || !data || data.userId !== userId) {
    throw new ApiError(404, "attempt_not_found", "We couldn't find that attempt.");
  }
  return data;
}

function assertOpen(data: AttemptDoc) {
  if (data.status !== "in_progress") {
    throw new ApiError(409, "attempt_closed", "This attempt has already ended.");
  }
}

/**
 * Begins an attempt: picks the questions, fixes the clock on the server, and hands back the questions
 * without their answers. Earlier unfinished attempts at the same quiz by the same person are closed,
 * so there is only ever one live attempt per person per quiz.
 */
export async function startAttempt(
  quizId: unknown,
  difficulty: unknown,
  userId: string,
  { now = Date.now(), accessCode }: Options & { accessCode?: unknown } = {}
): Promise<AttemptState> {
  assertSafeId(quizId, "quiz");
  if (typeof difficulty !== "string" || !SAFE_LEVEL.test(difficulty)) {
    throw new ApiError(400, "invalid_difficulty", "Pick a difficulty level.");
  }

  const quizSnap = await db.collection("quizzes").doc(quizId).get();
  if (!quizSnap.exists) {
    throw new ApiError(404, "quiz_not_found", "That quiz doesn't exist.");
  }
  const quiz = quizFromData(quizSnap.id, quizSnap.data() ?? {}, new Date());
  if (quiz.active === false) {
    throw new ApiError(403, "quiz_inactive", "This quiz isn't open right now.");
  }
  if (!(quiz.availableDifficulties ?? DEFAULT_LEVELS).includes(difficulty)) {
    throw new ApiError(400, "invalid_difficulty", "This quiz doesn't have that level.");
  }

  // The access code is checked here, on the server, and never sent to the browser.
  if (quiz.requiresAccessCode !== false && quiz.accessCode) {
    if (typeof accessCode !== "string" || !accessCode.trim()) {
      throw new ApiError(403, "access_code_required", "Enter the access code you were given.");
    }
    if (!accessCodeMatches(accessCode, quiz.accessCode)) {
      throw new ApiError(403, "access_code_invalid", "That access code doesn't match. Check it and try again.");
    }
  }

  // Earlier unfinished attempts at this quiz by this person are closed below; look them up alongside the questions.
  const [questions, previous] = await Promise.all([
    loadQuestions(quizId, difficulty),
    attempts()
      .where("userId", "==", userId)
      .where("quizId", "==", quizId)
      .where("status", "==", "in_progress")
      .get(),
  ]);
  if (questions.length === 0) {
    throw new ApiError(422, "no_questions", "This level has no questions yet.");
  }
  if (questions.length > MAX_QUESTIONS) {
    throw new ApiError(422, "too_many_questions", `Attempts support up to ${MAX_QUESTIONS} questions.`);
  }

  const durationSec = Math.round(getDifficultyDuration(quiz, difficulty) * 60);
  const stamp = Timestamp.fromMillis(now);
  const data: AttemptDoc = {
    quizId,
    userId,
    difficulty,
    status: "in_progress",
    startedAt: stamp,
    deadline: Timestamp.fromMillis(now + durationSec * 1000),
    durationSec,
    questions,
    autoCheck: quiz.isAutoCheck === true,
    showAnswerReview: quiz.showAnswerReview !== false,
    multiplier: getDifficultyMultiplier(quiz, difficulty),
    answers: Object.fromEntries(questions.map((q) => [q.id, null])),
    flagged: {},
    index: 0,
    tabSwitches: 0,
    fullscreenExits: 0,
    blurs: 0,
    events: [],
    eventSeq: 0,
    createdAt: stamp,
    updatedAt: stamp,
  };

  const ref = attempts().doc();
  const batch = db.batch();
  previous.forEach((doc) =>
    batch.update(doc.ref, { status: "abandoned", updatedAt: stamp })
  );
  batch.set(ref, data);
  await batch.commit();

  return toAttemptState(ref.id, data, now);
}

/** The running attempt, for a resume after a reload. Still returned after the deadline: the browser then submits it. */
export async function getAttempt(
  attemptId: unknown,
  userId: string,
  { now = Date.now() }: Options = {}
): Promise<AttemptState> {
  assertSafeId(attemptId, "attempt");
  const data = owned(await attempts().doc(attemptId).get(), userId);
  assertOpen(data);
  return toAttemptState(attemptId, data, now);
}

/**
 * Autosave. Replaces answers and flags with what the browser holds, and records the integrity events it
 * reports (tab hidden, window blur, left fullscreen) with the server's own timestamps.
 */
export async function saveProgress(
  attemptId: unknown,
  userId: string,
  patch: RawPatch,
  { now = Date.now() }: Options = {}
): Promise<void> {
  assertSafeId(attemptId, "attempt");
  const ref = attempts().doc(attemptId);

  await db.runTransaction(async (tx) => {
    const data = owned(await tx.get(ref), userId);
    assertOpen(data);
    if (now > data.deadline.toMillis() + SUBMIT_GRACE_MS) {
      throw new ApiError(409, "time_expired", "The time for this attempt has run out.");
    }

    const update: Partial<AttemptDoc> = { updatedAt: Timestamp.fromMillis(now) };
    if (patch.answers !== undefined) {
      update.answers = sanitizeAnswers(patch.answers, data.questions);
    }
    if (patch.flagged !== undefined) {
      update.flagged = sanitizeFlags(patch.flagged, data.questions);
    }
    if (typeof patch.index === "number" && Number.isFinite(patch.index)) {
      update.index = Math.min(
        Math.max(0, Math.trunc(patch.index)),
        data.questions.length - 1
      );
    }
    Object.assign(update, integrityFields(applyEvents(integrityOf(data), patch.events, now)));
    tx.update(ref, update);
  });
}

/**
 * Scores on the server and writes the response. Exactly once: a second submit (a double click, a retry
 * after a dropped connection) returns the stored result. A submit that arrives after the deadline plus
 * grace is not read at all; the attempt is finished from its last autosave and the result says `late`.
 */
export async function submitAttempt(
  attemptId: unknown,
  userId: string,
  payload: RawPatch,
  { now = Date.now() }: Options = {}
): Promise<SubmitResult> {
  assertSafeId(attemptId, "attempt");
  const attemptRef = attempts().doc(attemptId);
  const responseRef = db.collection("responses").doc(attemptId);

  return db.runTransaction(async (tx) => {
    const data = owned(await tx.get(attemptRef), userId);
    if (data.status === "submitted" && data.result) return data.result;
    assertOpen(data);

    const startedMs = data.startedAt.toMillis();
    const late = now > data.deadline.toMillis() + SUBMIT_GRACE_MS;

    const answers =
      !late && payload.answers !== undefined
        ? sanitizeAnswers(payload.answers, data.questions)
        : data.answers;
    // Events reported with a late submit are not read either, like the answers.
    const integrity = late
      ? integrityOf(data)
      : applyEvents(integrityOf(data), payload.events, now);

    const score = scoreAttempt({
      questions: data.questions,
      answers,
      autoCheck: data.autoCheck,
      multiplier: data.multiplier,
    });

    const review: Record<string, ReviewItem> | null =
      score.graded && data.showAnswerReview
        ? Object.fromEntries(
            data.questions.map((q) => [
              q.id,
              {
                correctIndex: q.correctIndex,
                ...(q.explanation && { explanation: q.explanation }),
              },
            ])
          )
        : null;

    const result: SubmitResult = {
      responseId: attemptId,
      graded: score.graded,
      score: score.score,
      rawPercent: score.rawPercent,
      correct: score.correct,
      total: score.total,
      answered: score.answered,
      multiplier: score.multiplier,
      timeTakenSec: Math.min(
        data.durationSec,
        Math.max(0, Math.round((now - startedMs) / 1000))
      ),
      late,
      answers,
      tabSwitches: integrity.tabSwitches,
      blurs: integrity.blurs,
      fullscreenExits: integrity.fullscreenExits,
      review,
    };

    const submittedAt = Timestamp.fromMillis(now);
    tx.set(responseRef, {
      quizId: data.quizId,
      userId,
      attemptId,
      startedAt: data.startedAt,
      submittedAt,
      score: score.score,
      rawPercent: score.rawPercent,
      correctCount: score.correct,
      totalQuestions: score.total,
      answeredCount: score.answered,
      pointsMultiplier: score.multiplier,
      tabSwitchCount: integrity.tabSwitches,
      selectedDifficulty: data.difficulty,
      late,
      ...(integrity.blurs > 0 && { blurCount: integrity.blurs }),
      ...(integrity.fullscreenExits > 0 && { fullscreenExits: integrity.fullscreenExits }),
      ...(integrity.events.length > 0 && { integrityEvents: integrity.events }),
    });

    for (const question of data.questions) {
      const selected = answers[question.id];
      if (typeof selected !== "number") continue;
      tx.set(responseRef.collection("answers").doc(question.id), {
        questionId: question.id,
        selectedIndex: selected,
        isCorrect: score.graded ? score.isCorrect[question.id] === true : null,
      });
    }

    tx.update(attemptRef, {
      status: "submitted",
      answers,
      ...integrityFields(integrity),
      submittedAt,
      updatedAt: submittedAt,
      result,
    });
    return result;
  });
}
