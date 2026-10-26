import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import type { QuestionCounts } from "@/lib/exam/types";
import { toPublicQuizDTO, type PublicQuizDTO } from "@/lib/quiz-data";
import { cached, QUIZZES_TAG, quizTag } from "./cache";
import { ApiError, assertSafeId } from "./request";

const SAFE_LEVEL = /^[a-z]{1,20}$/;

/** The fields a player may see, plus the two that decide whether a quiz is listed. Never the access code. */
const PUBLIC_FIELDS = [
  "title",
  "description",
  "duration",
  "requiresAccessCode",
  "examMode",
  "availableDifficulties",
  "difficultySettings",
  "createdAt",
  "isPublic",
  "active",
  "deletedAt",
] as const;

const createdMs = (data: Record<string, unknown>): number =>
  data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0;

/** Codes are compared without regard to case or surrounding spaces. */
export const accessCodeMatches = (typed: string, actual: string): boolean =>
  typed.trim().toLowerCase() === actual.trim().toLowerCase();

/**
 * Questions per level, for the lobby. Counts only; no question content. Every save (and the legacy
 * migration) stores them on the quiz as `questionCountByDifficulty`; only quizzes that predate that are
 * counted, all levels at once.
 */
async function countQuestions(
  quizId: string,
  levels: string[],
  stored: unknown
): Promise<QuestionCounts> {
  const safeLevels = levels.filter((level) => SAFE_LEVEL.test(level));
  const known = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : null;
  if (known) {
    // A level the save didn't list has no questions (a saved quiz has no legacy collection left).
    return Object.fromEntries(
      safeLevels.map((level) => [level, typeof known[level] === "number" ? (known[level] as number) : 0])
    );
  }

  const count = async (path: string) => (await db.collection(path).count().get()).data().count;
  const [legacy, ...perLevel] = await Promise.all([
    count(`quizzes/${quizId}/questions`),
    ...safeLevels.map((level) => count(`quizzes/${quizId}/questions_${level}`)),
  ]);
  // Older quizzes keep one `questions` collection for every level.
  return Object.fromEntries(
    safeLevels.map((level, i) => [level, perLevel[i] > 0 ? perLevel[i] : legacy])
  );
}

/** The quizzes people can pick from: switched on and not hidden. Never includes access codes. Cached. */
export function listPublicQuizzes(): Promise<PublicQuizDTO[]> {
  return cached(["public-quizzes"], [QUIZZES_TAG], async () => {
    const snapshot = await db
      .collection("quizzes")
      .select(...PUBLIC_FIELDS)
      .get();
    // Filtered here, not in the query: older quizzes have no `isPublic`/`active` field and still count.
    return snapshot.docs
      .filter((doc) => {
        const data = doc.data();
        return data.isPublic !== false && data.active !== false && !data.deletedAt;
      })
      .map((doc) => toPublicQuizDTO(doc.id, doc.data(), createdMs(doc.data())));
  });
}

type PublicQuizInfo = { quiz: PublicQuizDTO; active: boolean; counts: QuestionCounts };

/**
 * One quiz as a player may see it, plus its question counts. Hidden quizzes still resolve (the link or
 * code is how people reach them); a quiz that is switched off says so through `active`. Cached per quiz.
 */
export async function getPublicQuiz(quizId: unknown): Promise<PublicQuizInfo> {
  assertSafeId(quizId, "quiz");
  const info = await cached(["public-quiz", quizId], [quizTag(quizId)], async () => {
    const [snap] = await db.getAll(db.collection("quizzes").doc(quizId), {
      fieldMask: [...PUBLIC_FIELDS, "questionCountByDifficulty"],
    });
    // A quiz in the trash is gone as far as players can tell.
    if (!snap.exists || snap.data()?.deletedAt) return null;
    const data = snap.data() ?? {};
    const quiz = toPublicQuizDTO(snap.id, data, createdMs(data));
    return {
      quiz,
      active: data.active !== false,
      counts: await countQuestions(snap.id, quiz.availableDifficulties, data.questionCountByDifficulty),
    };
  });
  if (!info) {
    throw new ApiError(404, "quiz_not_found", "That quiz doesn't exist.");
  }
  return info;
}

/** Finds the quiz an access code belongs to. This is the only way a code turns into a quiz. */
export async function resolveQuizId(code: unknown): Promise<string> {
  const value = typeof code === "string" ? code.trim() : "";
  if (!value || value.length > 64) {
    throw new ApiError(400, "invalid_code", "Enter the access code you were given.");
  }
  // Codes are stored in capitals, but people type them any way: one query for the likely spellings, and
  // the closest spelling wins if two quizzes match.
  const spellings = [...new Set([value, value.toUpperCase(), value.toLowerCase()])];
  const found = await db
    .collection("quizzes")
    .where("accessCode", "in", spellings)
    .select("accessCode", "deletedAt")
    .limit(spellings.length)
    .get();
  for (const spelling of spellings) {
    const match = found.docs.find((doc) => doc.get("accessCode") === spelling && !doc.get("deletedAt"));
    if (match) return match.id;
  }
  throw new ApiError(404, "quiz_not_found", "We couldn't find a quiz with that code. Check it and try again.");
}
