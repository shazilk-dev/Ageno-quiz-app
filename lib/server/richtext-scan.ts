import type { Firestore } from "firebase-admin/firestore";
import { normalizeQuestion } from "@/lib/exam/normalize";
import { LEVELS } from "@/lib/quiz-schema";
import { LEGACY_COLLECTION, levelCollection } from "@/lib/quiz-writes";
import { scanQuestion, type RichTextHit } from "@/lib/rich-text/scan";

export interface RichTextScanHit extends RichTextHit {
  quizId: string;
  quizTitle: string;
  /** `"easy"`, `"medium"`, `"hard"`, or `"legacy"` for the old shared collection. */
  level: string;
  questionId: string;
}

export interface RichTextScanReport {
  quizzes: number;
  questions: number;
  hits: RichTextScanHit[];
}

/**
 * Reads every stored question (the trash included) and lists the text the rich-text renderer would show
 * differently from today's plain text. Read-only.
 */
export async function scanRichText(db: Firestore): Promise<RichTextScanReport> {
  const report: RichTextScanReport = { quizzes: 0, questions: 0, hits: [] };
  const quizzes = await db.collection("quizzes").get();

  for (const quiz of quizzes.docs) {
    report.quizzes++;
    const quizTitle = String(quiz.data().title ?? "(untitled)");
    for (const collection of [...LEVELS.map(levelCollection), LEGACY_COLLECTION]) {
      const snap = await quiz.ref.collection(collection).get();
      const level = collection === LEGACY_COLLECTION ? "legacy" : collection.replace("questions_", "");
      for (const doc of snap.docs) {
        report.questions++;
        for (const hit of scanQuestion(normalizeQuestion(doc.id, doc.data()))) {
          report.hits.push({ ...hit, quizId: quiz.id, quizTitle, level, questionId: doc.id });
        }
      }
    }
  }
  return report;
}
