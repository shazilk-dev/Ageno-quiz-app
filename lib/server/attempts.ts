import { Timestamp } from "firebase-admin/firestore";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import {
  applyEvents,
  type IntegrityState,
  type StoredIntegrityEvent,
} from "@/lib/exam/integrity";
import { toPicks } from "@/lib/exam/answers";
import {
  normalizeQuestion,
  upgradeStoredQuestion,
  type StoredQuestion,
} from "@/lib/exam/normalize";
import { buildReview, upgradeResult } from "@/lib/exam/review";
import { scoreAttempt } from "@/lib/exam/scoring";
import type {
  AttemptResult,
  AttemptState,
  ExamQuestion,
  ProgressPatch,
  SubmitResult,
} from "@/lib/exam/types";
import { quizFromData } from "@/lib/quiz-data";
import {
  LIMITS,
  isLevel,
  planLegacyQuestions,
  sortQuestionDocs,
} from "@/lib/quiz-schema";
import {
  getDifficultyDuration,
  getDifficultyMultiplier,
} from "@/utils/difficulty-helpers";
import { cached, quizTag } from "./cache";
import { readBoard, writeBoard } from "./leaderboard-store";
import { accessCodeMatches } from "./quizzes";
import { ApiError, assertSafeId } from "./request";

/** Answers and the final submit are still accepted this long after the deadline (network and clock slack). */
export const SUBMIT_GRACE_MS = 30_000;
/** One attempt document holds a copy of the questions, answer key and reasons included. */
export const MAX_QUESTIONS = LIMITS.maxQuestionsPerLevel;

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
  /**
   * A copy taken at the start: editing the quiz mid-attempt can't change what this attempt is scored on.
   * Attempts begun under the older question model hold `correctIndex`; `owned` reads them into this shape.
   */
  questions: StoredQuestion[];
  autoCheck: boolean;
  showAnswerReview: boolean;
  multiplier: number;
  /** Picks per question. Older attempts hold `number | null`; `owned` converts. */
  answers: Record<string, number[]>;
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

/**
 * A level's question set, answer key included, through the data cache: it only changes when an admin saves
 * the quiz, which clears `quiz:<id>`. Each attempt stores its own copy, so the cache can't change one that
 * has started.
 */
const loadQuestions = (quizId: string, level: string): Promise<StoredQuestion[]> =>
  cached(["questions", quizId, level], [quizTag(quizId)], () => readQuestions(quizId, level));

async function readQuestions(
  quizId: string,
  level: string
): Promise<StoredQuestion[]> {
  const perLevel = await db.collection(`quizzes/${quizId}/questions_${level}`).get();
  let docs = perLevel.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  if (perLevel.empty && isLevel(level)) {
    // Older quizzes keep one `questions` collection for every level (or name the level on each question).
    const legacy = (await db.collection(`quizzes/${quizId}/questions`).get()).docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }));
    docs = planLegacyQuestions(legacy, [level], new Set())[level] ?? [];
  }
  return sortQuestionDocs(docs).map((doc) => normalizeQuestion(doc.id, doc.data));
}

/** The only key-related facts that leave the server before a submit: the type, and how many to choose. */
const toExamQuestion = (question: StoredQuestion): ExamQuestion => ({
  id: question.id,
  text: question.text,
  options: question.options,
  type: question.type,
  ...(question.type === "multiple" &&
    question.correct.length > 0 && { pickCount: question.correct.length }),
  ...(question.imageUrl && { imageUrl: question.imageUrl }),
});

const optionCountsOf = (questions: StoredQuestion[]): Record<string, number> =>
  Object.fromEntries(questions.map((q) => [q.id, q.options.length]));

/** The stored result in the current shape, with the review rebuilt from the snapshot when it wasn't stored. */
function resultOf(data: AttemptDoc): SubmitResult {
  const result = upgradeResult(data.result as SubmitResult, optionCountsOf(data.questions));
  if (result.review === null && result.graded && data.showAnswerReview) {
    return { ...result, review: buildReview(data.questions) };
  }
  return result;
}

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

/**
 * Only the attempt's own questions, only whole option numbers inside the options, at most one pick for a
 * single-answer question; everything else becomes "unanswered" (`[]`). The older single `number | null`
 * is read too (a tab opened before the update still sends it).
 */
function sanitizeAnswers(
  raw: unknown,
  questions: StoredQuestion[]
): Record<string, number[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(400, "invalid_answers", "Answers must be an object keyed by question.");
  }
  const input = raw as Record<string, unknown>;
  const answers: Record<string, number[]> = {};
  for (const question of questions) {
    answers[question.id] = toPicks(input[question.id], question.options.length, question.type);
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

/**
 * The attempt, if it exists and belongs to this caller. Someone else's attempt looks like a missing one.
 * Attempts begun under the older question model are read into the current one here, so nothing
 * downstream knows there were two.
 */
function owned(snap: DocumentSnapshot, userId: string): AttemptDoc {
  const data = snap.data() as AttemptDoc | undefined;
  if (!snap.exists || !data || data.userId !== userId) {
    throw new ApiError(404, "attempt_not_found", "We couldn't find that attempt.");
  }
  const questions = data.questions.map(upgradeStoredQuestion);
  const storedAnswers = (data.answers ?? {}) as Record<string, unknown>;
  const answers: Record<string, number[]> = {};
  for (const question of questions) {
    answers[question.id] = toPicks(storedAnswers[question.id], question.options.length, question.type);
  }
  return { ...data, questions, answers };
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

  // The quiz and this person's unfinished attempts at it (closed below) don't depend on each other.
  const [quizSnap, previous] = await Promise.all([
    db.collection("quizzes").doc(quizId).get(),
    attempts()
      .where("userId", "==", userId)
      .where("quizId", "==", quizId)
      .where("status", "==", "in_progress")
      .select()
      .get(),
  ]);
  if (!quizSnap.exists || quizSnap.data()?.deletedAt) {
    throw new ApiError(404, "quiz_not_found", "That quiz doesn't exist.");
  }
  if (quizSnap.data()?.importing) {
    // An admin's large update is being written (or stopped half way): the questions aren't a whole set.
    throw new ApiError(409, "quiz_updating", "This quiz is being updated. Try again in a minute.");
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

  // Loaded only once the quiz and level are known to exist, so the cache holds real question sets only.
  const questions = await loadQuestions(quizId, difficulty);
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
    answers: Object.fromEntries(questions.map((q) => [q.id, [] as number[]])),
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
 * The stored result of a finished attempt, for its owner only. Everything comes from what the submit
 * wrote, so the review shows what the person saw then and never reveals more than the submit did.
 */
export async function getAttemptResult(
  attemptId: unknown,
  userId: string
): Promise<AttemptResult> {
  assertSafeId(attemptId, "attempt");
  const data = owned(await attempts().doc(attemptId).get(), userId);
  if (data.status !== "submitted" || !data.result) {
    throw new ApiError(409, "attempt_not_finished", "This attempt hasn't been submitted yet.");
  }
  const quizSnap = await db.collection("quizzes").doc(data.quizId).get();
  const title = quizSnap.data()?.title;
  return {
    attemptId,
    quizId: data.quizId,
    quizTitle: typeof title === "string" && title ? title : "Unknown quiz",
    difficulty: data.difficulty,
    submittedAt: (data.submittedAt ?? data.updatedAt).toMillis(),
    questions: data.questions.map(toExamQuestion),
    result: resultOf(data),
  };
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
 * A scored result also updates the person's leaderboard entry and totals in the same transaction, so the
 * board can never count an attempt twice or miss one. `onSubmitted` runs once, after the submit that
 * actually wrote the result (not after a repeat).
 */
export async function submitAttempt(
  attemptId: unknown,
  userId: string,
  payload: RawPatch,
  { now = Date.now(), onSubmitted }: Options & { onSubmitted?: (quizId: string) => void } = {}
): Promise<SubmitResult> {
  assertSafeId(attemptId, "attempt");
  const attemptRef = attempts().doc(attemptId);
  const responseRef = db.collection("responses").doc(attemptId);

  const { result, fresh, quizId } = await db.runTransaction(async (tx) => {
    const data = owned(await tx.get(attemptRef), userId);
    if (data.status === "submitted" && data.result) {
      return { result: resultOf(data), fresh: false, quizId: data.quizId };
    }
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
    // Read before any write (a transaction's rule). A result checked by hand has no score to rank.
    const board = typeof score.score === "number" ? await readBoard(tx, data.quizId, userId) : null;

    // Returned to the browser now but not stored: the review is rebuilt from the attempt's own question
    // snapshot whenever the result is read, so each reason and explanation lives once.
    const review =
      score.graded && data.showAnswerReview ? buildReview(data.questions) : null;

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

    // One compact answer sheet on the response instead of a document per answer: a submit writes a handful
    // of documents however many questions there are, and a per-question report reads one document each.
    const sheet: Record<string, { p: number[]; ok?: boolean }> = {};
    for (const question of data.questions) {
      const picks = answers[question.id];
      if (!picks || picks.length === 0) continue;
      sheet[question.id] = {
        p: picks,
        ...(score.graded && { ok: score.isCorrect[question.id] === true }),
      };
    }

    const submittedAt = Timestamp.fromMillis(now);
    tx.set(responseRef, {
      schemaVersion: 2,
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
      sheet,
    });

    tx.update(attemptRef, {
      status: "submitted",
      answers,
      ...integrityFields(integrity),
      submittedAt,
      updatedAt: submittedAt,
      result: { ...result, review: null },
    });

    if (board && typeof score.score === "number") {
      writeBoard(tx, board, {
        quizId: data.quizId,
        userId,
        score: score.score,
        difficulty: data.difficulty,
        startedAt: startedMs,
        submittedAt: now,
      });
    }
    return { result, fresh: true, quizId: data.quizId };
  });

  if (fresh) onSubmitted?.(quizId);
  return result;
}
