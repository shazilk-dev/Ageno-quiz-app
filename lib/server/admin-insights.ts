import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import { fileSlug } from "@/lib/download";
import {
  analyseLevel,
  countFlagged,
  type InsightAttempt,
  type InsightQuestion,
  type QuizInsights,
} from "@/lib/item-analysis";
import { questionResultsCsv, type QuestionResultsCsv } from "@/lib/question-results-csv";
import { firstLine } from "@/lib/rich-text/plain";
import { LEVELS, type AdminQuizDetail } from "@/lib/quiz-schema";
import { getAdminQuiz } from "./admin-quizzes";
import { namesFor } from "./admin-reports";
import { cached, quizTag } from "./cache";
import { ApiError, assertSafeId, isMissingIndex, isSafeId } from "./request";

// What the quiz's "Results by question" tab and its CSV read. One bounded query: the latest results of the
// quiz, only the fields they use (a result's sheet is one document, however many questions it holds). The
// statistics are kept in the data cache for five minutes under the quiz's tag. No counter document is written
// on a submit, so a mass exam still costs a handful of writes per result.

/** The most recent results read. Older ones are left out and the screen says so. */
export const MAX_RESULTS = 2000;

const LABEL_LENGTH = 160;

interface StoredResult {
  id: string;
  userId: string;
  level: string;
  score: number | null;
  /** Epoch ms. */
  submittedAt: number | null;
  sheet: InsightAttempt["sheet"];
}

/** The quiz's latest finished results with only the fields the analysis uses, and how many exist in all. */
async function readResults(quizId: string): Promise<{ results: StoredResult[]; total: number }> {
  const scope = db.collection("responses").where("quizId", "==", quizId);
  let snapshot: FirebaseFirestore.QuerySnapshot;
  let total: number;
  try {
    [snapshot, total] = await Promise.all([
      scope
        .orderBy("submittedAt", "desc")
        .select("sheet", "score", "selectedDifficulty", "userId", "submittedAt")
        .limit(MAX_RESULTS)
        .get(),
      scope.count().get().then((result) => result.data().count),
    ]);
  } catch (error) {
    if (isMissingIndex(error)) {
      throw new ApiError(503, "index_required", "Question results aren't ready yet. Try again shortly.");
    }
    throw error;
  }

  const results = snapshot.docs.map((doc): StoredResult => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: typeof data.userId === "string" ? data.userId : "",
      level: typeof data.selectedDifficulty === "string" ? data.selectedDifficulty : "medium",
      score: typeof data.score === "number" ? data.score : null,
      submittedAt: data.submittedAt instanceof Timestamp ? data.submittedAt.toMillis() : null,
      sheet: data.sheet && typeof data.sheet === "object" ? (data.sheet as InsightAttempt["sheet"]) : {},
    };
  });
  return { results, total };
}

/** The quiz's questions by level, as the analysis and the export need them. */
function questionsByLevel(quiz: AdminQuizDetail): { level: string; questions: InsightQuestion[] }[] {
  return LEVELS.flatMap((level) => {
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
    return [{ level, questions }];
  });
}

async function compute(quizId: string): Promise<QuizInsights> {
  const quiz = await getAdminQuiz(quizId);
  const { results, total } = await readResults(quizId);

  const byLevel = new Map<string, InsightAttempt[]>();
  for (const { level, score, sheet } of results) {
    const list = byLevel.get(level) ?? [];
    list.push({ score, sheet });
    byLevel.set(level, list);
  }

  const levels = questionsByLevel(quiz).map(({ level, questions }) =>
    analyseLevel(level, questions, byLevel.get(level) ?? [])
  );
  return { quizId, analysed: results.length, total, levels, flagged: countFlagged(levels) };
}

/** Per-question statistics for a quiz, from its latest finished results. Admin only (the caller checks). */
export async function getQuizInsights(quizId: unknown): Promise<QuizInsights> {
  assertSafeId(quizId, "quiz");
  return cached(["insights", quizId], [quizTag(quizId)], () => compute(quizId), 300);
}

/**
 * The quiz's latest results as a spreadsheet, one row per person and question (see `questionResultsCsv`).
 * Player names only, no email addresses, like the reports export. Not cached: an admin asked for it.
 */
export async function getQuestionResultsCsv(
  quizId: unknown
): Promise<QuestionResultsCsv & { filename: string; results: number }> {
  assertSafeId(quizId, "quiz");
  const quiz = await getAdminQuiz(quizId);
  const { results } = await readResults(quizId);
  const names = await namesFor(
    "users",
    [...new Set(results.map((result) => result.userId))].filter(isSafeId),
    (data) => String(data.displayName || data.email || ""),
    ["displayName", "email"]
  );
  const file = questionResultsCsv(
    quiz.title || "Untitled quiz",
    questionsByLevel(quiz),
    results.map((result) => ({
      id: result.id,
      player: names.get(result.userId) || "Unknown user",
      level: result.level,
      submittedAt: result.submittedAt,
      sheet: result.sheet,
    }))
  );
  return { ...file, filename: `${fileSlug(quiz.title)}-results-by-question.csv`, results: results.length };
}
