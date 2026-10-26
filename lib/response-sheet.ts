// The answer sheet of a result: what the person picked for each question and whether it was right, kept on
// the `responses/{id}` document itself (`sheet`, with `schemaVersion: 2`). Results before that kept one
// document per answer under `responses/{id}/answers/*`; `sheetFromAnswerDocs` reads those.

export interface SheetEntry {
  /** The picked options (canonical option positions, sorted). */
  p: number[];
  /** Scored right or wrong; absent when the quiz was not scored. */
  ok?: boolean;
}

export type Sheet = Record<string, SheetEntry>;

interface AnswerDoc {
  id: string;
  data: Record<string, unknown>;
}

/** The old per-answer documents (`{ questionId, selectedIndex, isCorrect }`) as one sheet. */
export function sheetFromAnswerDocs(docs: readonly AnswerDoc[]): Sheet {
  const sheet: Sheet = {};
  for (const { id, data } of docs) {
    const picked = data.selectedIndex;
    if (typeof picked !== "number" || !Number.isInteger(picked) || picked < 0) continue;
    const questionId = typeof data.questionId === "string" && data.questionId ? data.questionId : id;
    sheet[questionId] = {
      p: [picked],
      ...(typeof data.isCorrect === "boolean" ? { ok: data.isCorrect } : {}),
    };
  }
  return sheet;
}
