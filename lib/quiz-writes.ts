import { isDeepStrictEqual } from "node:util";
import {
  LEVELS,
  type Level,
  type QuestionDoc,
  type QuizInput,
  type StoredDoc,
  questionToDoc,
} from "./quiz-schema";

// What a save has to write to the question subcollections, worked out without touching the database, so
// the rules (what is kept, what is rewritten, what is removed) can be tested on their own. The server wraps
// the result in one transaction.

export interface ExistingQuestions {
  byLevel: Record<Level, StoredDoc[]>;
  /** The old shared `questions` collection. A save moves it into the level collections and empties it. */
  legacy: StoredDoc[];
}

export const emptyExisting = (): ExistingQuestions => ({
  byLevel: { easy: [], medium: [], hard: [] },
  legacy: [],
});

export interface QuestionWrites {
  /** Documents to create or replace. Unchanged questions are not in here. */
  sets: { collection: string; id: string; data: QuestionDoc }[];
  /** Documents to delete (removed questions, removed levels, the old shared collection). */
  removes: { collection: string; id: string }[];
  /** Questions per level after the save, for the quiz document. */
  counts: Partial<Record<Level, number>>;
}

export const LEGACY_COLLECTION = "questions";
export const levelCollection = (level: Level) => `questions_${level}`;

/**
 * Turns the questions an admin sent into writes. A question keeps its id when it is already stored (in its
 * own level collection, or in the old shared one it is being moved out of); anything else is a new
 * question with a new id. Order is the question's position in the list.
 */
export function planQuestionWrites(
  levels: QuizInput["levels"],
  existing: ExistingQuestions,
  newId: () => string
): QuestionWrites {
  const sets: QuestionWrites["sets"] = [];
  const removes: QuestionWrites["removes"] = [];
  const counts: QuestionWrites["counts"] = {};
  const legacyIds = new Set(existing.legacy.map((doc) => doc.id));

  for (const level of LEVELS) {
    const collection = levelCollection(level);
    const stored = new Map(existing.byLevel[level].map((doc) => [doc.id, doc.data]));
    const desired = levels[level]?.questions ?? [];
    const kept = new Set<string>();

    desired.forEach((question, index) => {
      const known = question.id !== undefined && (stored.has(question.id) || legacyIds.has(question.id));
      const id = known ? (question.id as string) : newId();
      kept.add(id);
      const data = questionToDoc(question, index);
      if (!isDeepStrictEqual(stored.get(id), data)) sets.push({ collection, id, data });
    });

    for (const id of stored.keys()) {
      if (!kept.has(id)) removes.push({ collection, id });
    }
    if (desired.length > 0) counts[level] = desired.length;
  }

  for (const doc of existing.legacy) {
    removes.push({ collection: LEGACY_COLLECTION, id: doc.id });
  }

  return { sets, removes, counts };
}

/** A Firestore transaction or batch holds 500 writes; the quiz document is one of them. */
export const MAX_WRITES_PER_SAVE = 500;

export const writeCount = (writes: QuestionWrites): number =>
  writes.sets.length + writes.removes.length + 1;
