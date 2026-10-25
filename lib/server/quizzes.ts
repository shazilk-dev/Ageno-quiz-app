import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import type { QuestionCounts } from "@/lib/exam/types";
import { toPublicQuizDTO, type PublicQuizDTO } from "@/lib/quiz-data";
import { ApiError, assertSafeId } from "./request";

const SAFE_LEVEL = /^[a-z]{1,20}$/;

const createdMs = (data: Record<string, unknown>): number =>
  data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0;

/** Codes are compared without regard to case or surrounding spaces. */
export const accessCodeMatches = (typed: string, actual: string): boolean =>
  typed.trim().toLowerCase() === actual.trim().toLowerCase();

/** Questions per level, for the lobby. Counts only; no question content. */
async function countQuestions(
  quizId: string,
  levels: string[]
): Promise<QuestionCounts> {
  const legacy = (await db.collection(`quizzes/${quizId}/questions`).count().get()).data().count;
  const counts: QuestionCounts = {};
  await Promise.all(
    levels
      .filter((level) => SAFE_LEVEL.test(level))
      .map(async (level) => {
        const perLevel = (
          await db.collection(`quizzes/${quizId}/questions_${level}`).count().get()
        ).data().count;
        // Older quizzes keep one `questions` collection for every level.
        counts[level] = perLevel > 0 ? perLevel : legacy;
      })
  );
  return counts;
}

/** The quizzes people can pick from: switched on and not hidden. Never includes access codes. */
export async function listPublicQuizzes(): Promise<PublicQuizDTO[]> {
  const snapshot = await db.collection("quizzes").get();
  return snapshot.docs
    .filter((doc) => {
      const data = doc.data();
      return data.isPublic !== false && data.active !== false;
    })
    .map((doc) => toPublicQuizDTO(doc.id, doc.data(), createdMs(doc.data())));
}

/**
 * One quiz as a player may see it, plus its question counts. Hidden quizzes still resolve (the link or
 * code is how people reach them); a quiz that is switched off says so through `active`.
 */
export async function getPublicQuiz(
  quizId: unknown
): Promise<{ quiz: PublicQuizDTO; active: boolean; counts: QuestionCounts }> {
  assertSafeId(quizId, "quiz");
  const snap = await db.collection("quizzes").doc(quizId).get();
  if (!snap.exists) {
    throw new ApiError(404, "quiz_not_found", "That quiz doesn't exist.");
  }
  const data = snap.data() ?? {};
  const quiz = toPublicQuizDTO(snap.id, data, createdMs(data));
  return {
    quiz,
    active: data.active !== false,
    counts: await countQuestions(snap.id, quiz.availableDifficulties),
  };
}

/** Finds the quiz an access code belongs to. This is the only way a code turns into a quiz. */
export async function resolveQuizId(code: unknown): Promise<string> {
  const value = typeof code === "string" ? code.trim() : "";
  if (!value || value.length > 64) {
    throw new ApiError(400, "invalid_code", "Enter the access code you were given.");
  }
  // Codes are stored in capitals, but people type them any way.
  for (const candidate of new Set([value, value.toUpperCase(), value.toLowerCase()])) {
    const found = await db
      .collection("quizzes")
      .where("accessCode", "==", candidate)
      .limit(1)
      .get();
    if (!found.empty) return found.docs[0].id;
  }
  throw new ApiError(404, "quiz_not_found", "We couldn't find a quiz with that code. Check it and try again.");
}
