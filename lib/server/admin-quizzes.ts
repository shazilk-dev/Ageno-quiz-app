import { randomInt } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import { quizFromData } from "@/lib/quiz-data";
import {
  LEVELS,
  LIMITS,
  type AdminQuizDetail,
  type AdminQuizSummary,
  type Level,
  type LevelInput,
  type QuizInput,
  type StoredDoc,
  levelsOf,
  makeAccessCode,
  planLegacyQuestions,
  questionFromStored,
  sortQuestionDocs,
  validateQuizInput,
} from "@/lib/quiz-schema";
import {
  LEGACY_COLLECTION,
  MAX_WRITES_PER_SAVE,
  emptyExisting,
  levelCollection,
  planQuestionWrites,
  writeCount,
  type ExistingQuestions,
  type QuestionWrites,
} from "@/lib/quiz-writes";
import { removeQuizFromLeaderboard, restoreQuizToLeaderboard } from "./leaderboard-store";
import { ApiError, assertSafeId } from "./request";

// Everything an admin does to a quiz goes through here: list, open, create, save, delete. The browser
// never writes quizzes, so the shape is checked (and the access code kept unique) in one place, and a save
// is one transaction: the quiz and its questions change together or not at all.

const quizzes = () => db.collection("quizzes");
const millis = (value: unknown): number => (value instanceof Timestamp ? value.toMillis() : 0);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function badInput(issues: { message: string }[]): ApiError {
  return new ApiError(400, "invalid_quiz", issues[0]?.message ?? "The quiz is not valid.");
}

/** Validates a request body; the first problem becomes the message. */
export function parseQuizInput(body: unknown): QuizInput {
  const result = validateQuizInput(body);
  if (!result.ok) throw badInput(result.issues);
  return result.value;
}

// ---- reading ---------------------------------------------------------------------------------------

const toDocs = (snapshot: FirebaseFirestore.QuerySnapshot): StoredDoc[] =>
  snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));

async function loadExisting(
  quizId: string,
  read: (query: FirebaseFirestore.Query) => Promise<FirebaseFirestore.QuerySnapshot>
): Promise<ExistingQuestions> {
  const [easy, medium, hard, legacy] = await Promise.all([
    read(quizzes().doc(quizId).collection(levelCollection("easy"))),
    read(quizzes().doc(quizId).collection(levelCollection("medium"))),
    read(quizzes().doc(quizId).collection(levelCollection("hard"))),
    read(quizzes().doc(quizId).collection(LEGACY_COLLECTION)),
  ]);
  return {
    byLevel: { easy: toDocs(easy), medium: toDocs(medium), hard: toDocs(hard) },
    legacy: toDocs(legacy),
  };
}

const responseCountOf = async (quizId: string): Promise<number> =>
  (await db.collection("responses").where("quizId", "==", quizId).count().get()).data().count;

/**
 * The stored `responseCount` (kept by every submit, see `countResponse`), once it's known to be complete:
 * a quiz created since it existed, or one the leaderboard backfill counted. Otherwise counted.
 */
const listedResponseCount = (quizId: string, data: FirebaseFirestore.DocumentData): Promise<number> | number =>
  data.responseCountTracked === true && typeof data.responseCount === "number"
    ? data.responseCount
    : responseCountOf(quizId);

/** Every quiz for the admin list: one query, plus a count only for quizzes from before stored counts. */
export async function listAdminQuizzes(): Promise<AdminQuizSummary[]> {
  const snapshot = await quizzes().get();
  const rows = await Promise.all(
    snapshot.docs.map(async (doc): Promise<AdminQuizSummary> => {
      const data = doc.data();
      const quiz = quizFromData(doc.id, data, new Date(millis(data.createdAt)));
      const stored = data.questionCountByDifficulty as Record<string, unknown> | undefined;

      const counts: AdminQuizSummary["counts"] = {};
      await Promise.all(
        LEVELS.map(async (level) => {
          const known = stored?.[level];
          const count =
            typeof known === "number"
              ? known
              : (await doc.ref.collection(levelCollection(level)).count().get()).data().count;
          if (count > 0) counts[level] = count;
        })
      );

      return {
        id: doc.id,
        title: quiz.title || "Untitled quiz",
        description: quiz.description,
        accessCode: quiz.accessCode,
        requiresAccessCode: quiz.requiresAccessCode !== false,
        isPublic: data.isPublic !== false,
        active: quiz.active !== false,
        isAutoCheck: quiz.isAutoCheck,
        examMode: quiz.examMode ?? "practice",
        duration: quiz.duration,
        counts,
        responseCount: await listedResponseCount(doc.id, data),
        createdAt: millis(data.createdAt),
        deletedAt: data.deletedAt instanceof Timestamp ? data.deletedAt.toMillis() : null,
      };
    })
  );
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** One quiz for the editor, answer key included. Older quizzes (one shared `questions` collection) are shown at every level they served. */
export async function getAdminQuiz(quizId: unknown): Promise<AdminQuizDetail> {
  assertSafeId(quizId, "quiz");
  const snap = await quizzes().doc(quizId).get();
  if (!snap.exists) {
    throw new ApiError(404, "quiz_not_found", "That quiz doesn't exist.");
  }
  const data = snap.data() ?? {};
  const existing = await loadExisting(quizId, (query) => query.get());
  return toDetail(snap.id, data, existing, await responseCountOf(quizId));
}

function toDetail(
  id: string,
  data: FirebaseFirestore.DocumentData,
  existing: ExistingQuestions,
  responseCount: number
): AdminQuizDetail {
  const quiz = quizFromData(id, data, new Date(millis(data.createdAt)));
  const defaultMinutes = clamp(Math.round(quiz.duration || 30), LIMITS.minMinutes, LIMITS.maxMinutes);

  const own = new Set<Level>(LEVELS.filter((level) => existing.byLevel[level].length > 0));
  const fromLegacy = planLegacyQuestions(existing.legacy, LEVELS, own);
  const declared = new Set<string>(quiz.availableDifficulties ?? []);

  const levels: QuizInput["levels"] = {};
  for (const level of LEVELS) {
    const docs = sortQuestionDocs(own.has(level) ? existing.byLevel[level] : fromLegacy[level] ?? []);
    if (docs.length === 0 && !declared.has(level)) continue;
    const settings = quiz.difficultySettings?.[level];
    const entry: LevelInput = {
      duration: clamp(Math.round(settings?.duration || defaultMinutes), LIMITS.minMinutes, LIMITS.maxMinutes),
      pointsMultiplier: clamp(settings?.pointsMultiplier || 1, LIMITS.minMultiplier, LIMITS.maxMultiplier),
      questions: docs.map((doc) => questionFromStored(doc.id, doc.data)),
    };
    levels[level] = entry;
  }

  return {
    id,
    version: millis(data.updatedAt),
    createdAt: millis(data.createdAt),
    createdBy: quiz.createdBy,
    responseCount,
    title: quiz.title,
    description: quiz.description,
    duration: defaultMinutes,
    accessCode: quiz.accessCode,
    requiresAccessCode: quiz.requiresAccessCode !== false,
    isPublic: data.isPublic !== false,
    active: quiz.active !== false,
    isAutoCheck: quiz.isAutoCheck,
    showAnswerReview: quiz.showAnswerReview !== false,
    examMode: quiz.examMode ?? "practice",
    levels,
    ...(data.importing ? { updateUnfinished: true } : {}),
  };
}

// ---- writing ---------------------------------------------------------------------------------------

/** Is another quiz already using this code? Codes are matched without regard to case, so both are checked. */
async function codeTakenBy(
  code: string,
  read: (query: FirebaseFirestore.Query) => Promise<FirebaseFirestore.QuerySnapshot>
): Promise<string | null> {
  const found = await read(
    quizzes().where("accessCode", "in", [...new Set([code, code.toLowerCase()])]).limit(2)
  );
  return found.empty ? null : found.docs[0].id;
}

async function chooseAccessCode(
  wanted: string,
  quizId: string | null,
  read: (query: FirebaseFirestore.Query) => Promise<FirebaseFirestore.QuerySnapshot>
): Promise<string> {
  if (wanted) {
    const owner = await codeTakenBy(wanted, read);
    if (owner && owner !== quizId) {
      throw new ApiError(409, "access_code_taken", "Another quiz already uses that access code.");
    }
    return wanted;
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = makeAccessCode(randomInt);
    if (!(await codeTakenBy(code, read))) return code;
  }
  throw new ApiError(500, "server_error", "Couldn't make an access code. Try again.");
}

function quizFields(input: QuizInput, accessCode: string, counts: QuestionWrites["counts"], now: Timestamp) {
  const settings: Record<string, { duration: number; pointsMultiplier: number }> = {};
  for (const level of levelsOf(input.levels)) {
    const { duration, pointsMultiplier } = input.levels[level] as LevelInput;
    settings[level] = { duration, pointsMultiplier };
  }
  return {
    title: input.title,
    description: input.description,
    duration: input.duration,
    accessCode,
    requiresAccessCode: input.requiresAccessCode,
    isPublic: input.isPublic,
    active: input.active,
    isAutoCheck: input.isAutoCheck,
    showAnswerReview: input.showAnswerReview,
    examMode: input.examMode,
    availableDifficulties: levelsOf(input.levels),
    difficultySettings: settings,
    questionCountByDifficulty: counts,
    updatedAt: now,
  };
}

function assertFitsOneSave(writes: QuestionWrites) {
  if (writeCount(writes) > MAX_WRITES_PER_SAVE) {
    throw new ApiError(
      400,
      "too_many_changes",
      "That's too many changes to save in one step."
    );
  }
}

/** How long an update that says "running" is believed. A function that died mid-way never says otherwise. */
const UPDATE_STALE_MS = 3 * 60 * 1000;

/**
 * A large update marks the quiz `importing` while it writes in chunks. Nobody else may save it then, and
 * players can't start it (`startAttempt` checks the same flag). A mark older than `UPDATE_STALE_MS`, or one
 * that says "interrupted", is something to finish, so a new save is allowed to take over.
 */
function assertNotUpdating(data: FirebaseFirestore.DocumentData | undefined) {
  const flag = data?.importing;
  if (
    flag &&
    flag.state === "running" &&
    flag.at instanceof Timestamp &&
    Date.now() - flag.at.toMillis() < UPDATE_STALE_MS
  ) {
    throw new ApiError(409, "quiz_updating", "This quiz is being updated right now. Try again in a minute.");
  }
}

const newQuestionId = () => quizzes().doc().id;

/** Writes per batch when a create has to be split (under the 500 limit, with room to spare). */
const CHUNK = 450;

function applyQuestionWrites(
  target: { set: (ref: FirebaseFirestore.DocumentReference, data: object) => unknown; delete: (ref: FirebaseFirestore.DocumentReference) => unknown },
  quizId: string,
  writes: QuestionWrites
) {
  for (const { collection, id, data } of writes.sets) {
    target.set(quizzes().doc(quizId).collection(collection).doc(id), data);
  }
  for (const { collection, id } of writes.removes) {
    target.delete(quizzes().doc(quizId).collection(collection).doc(id));
  }
}

export async function createQuiz(
  input: QuizInput,
  uid: string
): Promise<{ id: string; version: number; accessCode: string }> {
  const ref = quizzes().doc();
  const accessCode = await chooseAccessCode(input.accessCode, null, (query) => query.get());
  const writes = planQuestionWrites(input.levels, emptyExisting(), newQuestionId);
  const now = Timestamp.now();
  const quizDoc = {
    ...quizFields(input, accessCode, writes.counts, now),
    createdAt: now,
    createdBy: uid,
    responseCount: 0,
    responseCountTracked: true,
  };

  if (writeCount(writes) <= MAX_WRITES_PER_SAVE) {
    const batch = db.batch();
    batch.set(ref, quizDoc);
    applyQuestionWrites(batch, ref.id, writes);
    await batch.commit();
  } else {
    // A big quiz (a bulk import) doesn't fit one batch. Nobody can see it until its document exists, so
    // write the questions in chunks and the quiz last; if a chunk fails, take back what was written.
    try {
      for (let start = 0; start < writes.sets.length; start += CHUNK) {
        const batch = db.batch();
        applyQuestionWrites(batch, ref.id, { ...writes, sets: writes.sets.slice(start, start + CHUNK), removes: [] });
        await batch.commit();
      }
      await ref.set(quizDoc);
    } catch (error) {
      await db.recursiveDelete(ref).catch(() => undefined);
      throw error;
    }
  }
  return { id: ref.id, version: now.toMillis(), accessCode };
}

/**
 * Saves a quiz: its fields and its questions, in one transaction (so at most `MAX_WRITES_PER_SAVE` writes;
 * only questions that changed count, so ordinary edits are far below it). `version` is the `updatedAt` the editor
 * opened the quiz with; if someone saved in between, nothing is written (409) and the editor says so.
 * Old-shape questions are moved into the level collections as part of the same write.
 */
export async function updateQuiz(
  quizId: unknown,
  input: QuizInput,
  version: unknown
): Promise<{ version: number; accessCode: string }> {
  assertSafeId(quizId, "quiz");
  if (typeof version !== "number" || !Number.isFinite(version)) {
    throw new ApiError(400, "invalid_version", "Reload the quiz and try again.");
  }
  const ref = quizzes().doc(quizId);

  try {
    return await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      assertEditable(snap, version);
      assertNotUpdating(snap.data());

      const accessCode = await chooseAccessCode(input.accessCode, quizId, (query) => tx.get(query));
      const existing = await loadExisting(quizId, (query) => tx.get(query));
      const writes = planQuestionWrites(input.levels, existing, newQuestionId);
      assertFitsOneSave(writes);

      const now = Timestamp.now();
      // Saving also finishes (or replaces) an update that was left half done.
      tx.update(ref, { ...quizFields(input, accessCode, writes.counts, now), importing: FieldValue.delete() });
      applyQuestionWrites(tx, quizId, writes);
      return { version: now.toMillis(), accessCode };
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "too_many_changes") {
      return updateQuizInChunks(quizId, input, version);
    }
    throw error;
  }
}

function assertEditable(snap: FirebaseFirestore.DocumentSnapshot, version: number) {
  if (!snap.exists) {
    throw new ApiError(404, "quiz_not_found", "That quiz doesn't exist.");
  }
  if (snap.data()?.deletedAt) {
    throw new ApiError(409, "quiz_in_trash", "This quiz is in the trash. Restore it before editing.");
  }
  if (millis(snap.data()?.updatedAt) !== version) {
    throw new ApiError(
      409,
      "quiz_changed",
      "Someone else saved this quiz while you were editing. Reload it to see their changes."
    );
  }
}

/**
 * A save with more than `MAX_WRITES_PER_SAVE` writes (for example replacing a 400-question level) can't be
 * one transaction. It is NOT all-or-nothing, so it is done carefully and says so when it fails:
 *  1. work out the writes, then mark the quiz `importing` (checking `version`). Players can't start it
 *     meanwhile; attempts already running hold their own copy of the questions and finish normally;
 *  2. write the questions in chunks;
 *  3. write the quiz fields last and clear the mark.
 * If a chunk fails the mark stays (state "interrupted") and the error says so. Sending the same request again
 * finishes the job (the writes are worked out from what is stored now, so it converges), and sending the
 * previous contents puts the quiz back. `updatedAt` changes only in step 3, so the `version` the admin holds
 * stays valid for either.
 */
async function updateQuizInChunks(
  quizId: string,
  input: QuizInput,
  version: number
): Promise<{ version: number; accessCode: string }> {
  const ref = quizzes().doc(quizId);
  const accessCode = await chooseAccessCode(input.accessCode, quizId, (query) => query.get());
  const existing = await loadExisting(quizId, (query) => query.get());
  const writes = planQuestionWrites(input.levels, existing, newQuestionId);

  // Anyone who saved since the admin opened the quiz has changed `updatedAt`, so this refuses before any write.
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    assertEditable(snap, version);
    assertNotUpdating(snap.data());
    tx.update(ref, { importing: { state: "running", at: Timestamp.now() } });
  });

  try {
    for (let start = 0; start < writes.sets.length; start += CHUNK) {
      const batch = db.batch();
      applyQuestionWrites(batch, quizId, { ...writes, sets: writes.sets.slice(start, start + CHUNK), removes: [] });
      await batch.commit();
    }
    for (let start = 0; start < writes.removes.length; start += CHUNK) {
      const batch = db.batch();
      applyQuestionWrites(batch, quizId, { ...writes, sets: [], removes: writes.removes.slice(start, start + CHUNK) });
      await batch.commit();
    }
    const now = Timestamp.now();
    await ref.update({ ...quizFields(input, accessCode, writes.counts, now), importing: FieldValue.delete() });
    return { version: now.toMillis(), accessCode };
  } catch {
    await ref.update({ importing: { state: "interrupted", at: Timestamp.now() } }).catch(() => undefined);
    throw new ApiError(
      500,
      "update_interrupted",
      "Part of the update was applied before something went wrong. Players can't start this quiz until it is finished. Try again, or put the quiz back as it was."
    );
  }
}

// ---- the trash -------------------------------------------------------------------------------------

/**
 * Moves a quiz to the trash: players can no longer find or start it, its leaderboard rows are hidden and
 * attempts still running are closed (so a late submit can't put the quiz back on a board), but the quiz,
 * its questions and everyone's results stay until it is deleted for good. Moving it back is `restoreQuiz`.
 */
export async function trashQuiz(quizId: unknown, adminUid: string): Promise<{ responseCount: number }> {
  assertSafeId(quizId, "quiz");
  const ref = quizzes().doc(quizId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "quiz_not_found", "That quiz doesn't exist.");
  if (!snap.data()?.deletedAt) {
    // First, so nobody can start it from now on; then what is already running; then the boards.
    await ref.update({ deletedAt: Timestamp.now(), deletedBy: adminUid });
    await closeRunningAttempts(quizId);
    await removeQuizFromLeaderboard(quizId);
  }
  return { responseCount: await listedResponseCount(quizId, snap.data() ?? {}) };
}

/** Takes a quiz out of the trash: it is listed again as before, and its results are back on the boards. */
export async function restoreQuiz(quizId: unknown): Promise<void> {
  assertSafeId(quizId, "quiz");
  const ref = quizzes().doc(quizId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "quiz_not_found", "That quiz doesn't exist.");
  if (!snap.data()?.deletedAt) return;
  // Boards first: if this fails halfway the quiz is still in the trash and can be restored again.
  await restoreQuizToLeaderboard(quizId);
  await ref.update({ deletedAt: FieldValue.delete(), deletedBy: FieldValue.delete() });
}

/** Deletes a quiz in the trash for good. The admin has to type its title, and it has to be in the trash already. */
export async function deleteQuizForever(
  quizId: unknown,
  title: unknown
): Promise<{ deletedResults: number }> {
  assertSafeId(quizId, "quiz");
  const snap = await quizzes().doc(quizId).get();
  if (!snap.exists) throw new ApiError(404, "quiz_not_found", "That quiz doesn't exist.");
  if (!snap.data()?.deletedAt) {
    throw new ApiError(409, "quiz_not_in_trash", "Move the quiz to the trash first.");
  }
  const actual = String(snap.data()?.title ?? "").trim();
  if (typeof title !== "string" || title.trim() !== actual) {
    throw new ApiError(400, "title_mismatch", "Type the quiz's title exactly to delete it for good.");
  }
  return deleteQuiz(quizId);
}

/** Ends the unfinished attempts at a quiz (they can't be submitted afterwards). */
async function closeRunningAttempts(quizId: string): Promise<void> {
  const now = Timestamp.now();
  for (;;) {
    const page = await db
      .collection("attempts")
      .where("quizId", "==", quizId)
      .where("status", "==", "in_progress")
      .select()
      .limit(300)
      .get();
    if (page.empty) return;
    const batch = db.batch();
    page.docs.forEach((doc) => batch.update(doc.ref, { status: "abandoned", updatedAt: now }));
    await batch.commit();
  }
}

// ---- deleting --------------------------------------------------------------------------------------

/** Deletes every document a query matches (and what is under each), a page at a time. */
async function deleteMatching(firestore: Firestore, query: FirebaseFirestore.Query): Promise<number> {
  let deleted = 0;
  for (;;) {
    const page = await query.select().limit(300).get();
    if (page.empty) return deleted;
    await Promise.all(page.docs.map((doc) => firestore.recursiveDelete(doc.ref)));
    deleted += page.size;
  }
}

/**
 * Deletes a quiz together with everything that belongs to it (only `deleteQuizForever` is reachable from a route): its questions, people's results (and the
 * answers under each), its leaderboard rows (each person's totals are worked out again without it), and
 * attempts still on file. The quiz document goes last, so a run that fails halfway leaves a quiz that is
 * still listed and can be deleted again.
 */
export async function deleteQuiz(quizId: unknown): Promise<{ deletedResults: number }> {
  assertSafeId(quizId, "quiz");
  const ref = quizzes().doc(quizId);
  if (!(await ref.get()).exists) {
    throw new ApiError(404, "quiz_not_found", "That quiz doesn't exist.");
  }
  const deletedResults = await deleteMatching(db, db.collection("responses").where("quizId", "==", quizId));
  await removeQuizFromLeaderboard(quizId);
  await deleteMatching(db, db.collection("attempts").where("quizId", "==", quizId));
  await db.recursiveDelete(ref);
  return { deletedResults };
}
