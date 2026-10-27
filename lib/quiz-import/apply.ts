import { questionToDoc, type EditorQuestion } from "@/lib/quiz-schema";

// What an import does to one level, worked out in memory so the wizard can show it before anything is
// saved. The save itself goes through the usual quiz routes, whose `planQuestionWrites` makes the same
// decisions (a question is kept by its id, and it counts as changed when its stored form or its position
// differs), so the numbers shown here are the numbers that get written.

/**
 * - `add`: the file's questions go after the current ones, as new questions (ids in the file are ignored).
 * - `replace`: the level becomes the file's questions. A question whose id is already in the level keeps it.
 * - `update`: questions with an id already in the level are changed in place; the rest of the file is added
 *   at the end; questions the file doesn't mention stay. Nothing is removed.
 */
export type ImportMode = "add" | "replace" | "update";

function withoutId(question: EditorQuestion): EditorQuestion {
  const copy = { ...question };
  delete copy.id;
  return copy;
}

// `questionToDoc` builds its keys in a fixed order, so the JSON text of two equal questions is equal.
const sameDoc = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function applyImport(
  current: readonly EditorQuestion[],
  incoming: readonly EditorQuestion[],
  mode: ImportMode
): EditorQuestion[] {
  if (mode === "add") return [...current, ...incoming.map(withoutId)];
  if (mode === "replace") return [...incoming];

  const known = new Set(current.map((question) => question.id).filter((id): id is string => !!id));
  const byId = new Map(incoming.filter((question) => question.id && known.has(question.id)).map((question) => [question.id as string, question]));
  const updated = current.map((question) => (question.id ? (byId.get(question.id) ?? question) : question));
  const added = incoming.filter((question) => !question.id || !known.has(question.id)).map(withoutId);
  return [...updated, ...added];
}

export interface QuestionDiff {
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
}

/** "12 new, 30 changed, 5 removed, 3 unchanged", counted the way `planQuestionWrites` decides. */
export function diffQuestions(before: readonly EditorQuestion[], after: readonly EditorQuestion[]): QuestionDiff {
  const stored = new Map<string, unknown>();
  before.forEach((question, index) => {
    if (question.id) stored.set(question.id, questionToDoc(question, index));
  });
  const diff: QuestionDiff = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  const kept = new Set<string>();
  after.forEach((question, index) => {
    if (!question.id || !stored.has(question.id)) {
      diff.added++;
      return;
    }
    kept.add(question.id);
    if (sameDoc(stored.get(question.id), questionToDoc(question, index))) diff.unchanged++;
    else diff.changed++;
  });
  diff.removed = [...stored.keys()].filter((id) => !kept.has(id)).length;
  return diff;
}

export function describeDiff(diff: QuestionDiff): string {
  const parts = [
    diff.added && `${diff.added} new`,
    diff.changed && `${diff.changed} changed`,
    diff.removed && `${diff.removed} removed`,
    diff.unchanged && `${diff.unchanged} unchanged`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "No changes";
}
