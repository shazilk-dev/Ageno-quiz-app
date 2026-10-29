import { db } from "@/firebase/admin";
import {
  analyseLevel,
  countFlagged,
  type InsightAttempt,
  type InsightQuestion,
  type QuizInsights,
} from "@/lib/item-analysis";
import { firstLine } from "@/lib/rich-text/plain";
import { LEVELS } from "@/lib/quiz-schema";
import { getAdminQuiz } from "./admin-quizzes";
import { cached, quizTag } from "./cache";
import { ApiError, assertSafeId } from "./request";

// What the quiz's "Results by question" tab reads. One bounded query: the latest results of the quiz, only
// the fields the analysis uses (a result's sheet is one document, however many questions it holds), kept in
// the data cache for five minutes under the quiz's tag. No counter document is written on a submit, so a
// mass exam still costs a handful of writes per result.

/** The most recent results read. Older ones are left out and the screen says so. */
export const MAX_RESULTS = 2000;

const LABEL_LENGTH = 160;

async function compute(quizId: string): Promise<QuizInsights> {
  const quiz = await getAdminQuiz(quizId);

  const scope = db.collection("responses").where("quizId", "==", quizId);
  let snapshot: FirebaseFirestore.QuerySnapshot;
  let total: number;
  try {
    [snapshot, total] = await Promise.all([
      scope.orderBy("submittedAt", "desc").select("sheet", "score", "selectedDifficulty").limit(MAX_RESULTS).get(),
      scope.count().get().then((result) => result.data().count),
    ]);
  } catch (error) {
    // 9 = FAILED_PRECONDITION: the quizId + submittedAt index isn't deployed (or is still building).
    if ((error as { code?: number }).code === 9) {
      throw new ApiError(503, "index_required", "Question results aren't ready yet. Try again shortly.");
    }
    throw error;
  }

  const byLevel = new Map<string, InsightAttempt[]>();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const sheet = data.sheet && typeof data.sheet === "object" ? (data.sheet as InsightAttempt["sheet"]) : {};
    const level = typeof data.selectedDifficulty === "string" ? data.selectedDifficulty : "medium";
    const list = byLevel.get(level) ?? [];
    list.push({ score: typeof data.score === "number" ? data.score : null, sheet });
    byLevel.set(level, list);
  }

  const levels = LEVELS.flatMap((level) => {
    const entry = quiz.levels[level];
    if (!entry || entry.questions.length === 0) return [];
    const questions: InsightQuestion[] = entry.questions.flatMap((question) =>
      question.id
        ? [
            {
              id: question.id,
              label: firstLine(question.text).slice(0, LABEL_LENGTH),
              type: question.type,
              options: question.options.map(({ text, isCorrect }) => ({ text, isCorrect })),
            },
          ]
        : []
    );
    return [analyseLevel(level, questions, byLevel.get(level) ?? [])];
  });

  return { quizId, analysed: snapshot.size, total, levels, flagged: countFlagged(levels) };
}

/** Per-question statistics for a quiz, from its latest finished results. Admin only (the caller checks). */
export async function getQuizInsights(quizId: unknown): Promise<QuizInsights> {
  assertSafeId(quizId, "quiz");
  return cached(["insights", quizId], [quizTag(quizId)], () => compute(quizId), 300);
}
