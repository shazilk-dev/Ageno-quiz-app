import type { Firestore } from "firebase-admin/firestore";
import {
  LEVELS,
  isLevel,
  planLegacyQuestions,
  questionFromStored,
  questionToDoc,
  type Level,
  type StoredDoc,
} from "@/lib/quiz-schema";
import { LEGACY_COLLECTION, levelCollection } from "@/lib/quiz-writes";

export interface MigrationReportRow {
  quizId: string;
  /** Documents found in the old shared `questions` collection. */
  legacyCount: number;
  /** Questions copied into each level collection. */
  copied: Partial<Record<Level, number>>;
  /** Old documents removed (copied, or hidden anyway by a level's own questions). */
  removed: number;
  /** Old documents left alone: they name a level the quiz doesn't offer. */
  unplaced: number;
  applied: boolean;
}

export interface MigrationReport {
  quizzes: MigrationReportRow[];
}

const BATCH_LIMIT = 450;

/**
 * Moves quizzes that still keep their questions in the old shared `questions` collection into the per-level
 * collections, in the stored shape the editor writes. Nothing is changed unless `apply` is true.
 * Safe to run again: copies keep their ids (so they overwrite themselves) and old documents go last.
 */
export async function migrateLegacyQuestions(
  db: Firestore,
  { apply }: { apply: boolean }
): Promise<MigrationReport> {
  const rows: MigrationReportRow[] = [];
  const quizzes = await db.collection("quizzes").get();

  for (const quiz of quizzes.docs) {
    const legacySnap = await quiz.ref.collection(LEGACY_COLLECTION).get();
    if (legacySnap.empty) continue;
    const legacy: StoredDoc[] = legacySnap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));

    const own = new Set<Level>();
    const ownCounts: Partial<Record<Level, number>> = {};
    for (const level of LEVELS) {
      const count = (await quiz.ref.collection(levelCollection(level)).count().get()).data().count;
      if (count > 0) {
        own.add(level);
        ownCounts[level] = count;
      }
    }

    const declared = quiz.data().availableDifficulties;
    const offered = Array.isArray(declared) ? LEVELS.filter((level) => declared.includes(level)) : [...LEVELS];
    const plan = planLegacyQuestions(legacy, offered, own);

    const placedIds = new Set(Object.values(plan).flatMap((docs) => docs.map((doc) => doc.id)));
    // Hidden anyway: every level it was meant for already has its own questions.
    const removable = legacy.filter((doc) => {
      if (placedIds.has(doc.id)) return true;
      const named = doc.data.difficulty;
      return isLevel(named) ? own.has(named) : offered.every((level) => own.has(level));
    });

    const copied: MigrationReportRow["copied"] = {};
    const writes: { level: Level; id: string; data: ReturnType<typeof questionToDoc> }[] = [];
    for (const level of LEVELS) {
      const docs = plan[level];
      if (!docs) continue;
      copied[level] = docs.length;
      docs.forEach((doc, index) => {
        writes.push({ level, id: doc.id, data: questionToDoc(questionFromStored(doc.id, doc.data), index) });
      });
    }

    rows.push({
      quizId: quiz.id,
      legacyCount: legacy.length,
      copied,
      removed: removable.length,
      unplaced: legacy.length - removable.length,
      applied: apply,
    });
    if (!apply) continue;

    const counts: Partial<Record<Level, number>> = { ...ownCounts };
    for (const level of LEVELS) if (copied[level]) counts[level] = copied[level];

    // Copies first, old documents last, the count with the final batch: a run that stops partway can be repeated.
    const operations: ((batch: FirebaseFirestore.WriteBatch) => void)[] = [
      ...writes.map(({ level, id, data }) => (batch: FirebaseFirestore.WriteBatch) =>
        batch.set(quiz.ref.collection(levelCollection(level)).doc(id), data)
      ),
      ...removable.map((doc) => (batch: FirebaseFirestore.WriteBatch) =>
        batch.delete(quiz.ref.collection(LEGACY_COLLECTION).doc(doc.id))
      ),
      (batch) => batch.update(quiz.ref, { questionCountByDifficulty: counts }),
    ];
    for (let start = 0; start < operations.length; start += BATCH_LIMIT) {
      const batch = db.batch();
      operations.slice(start, start + BATCH_LIMIT).forEach((operation) => operation(batch));
      await batch.commit();
    }
  }
  return { quizzes: rows };
}
