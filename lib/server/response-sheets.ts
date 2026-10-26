import type { Firestore } from "firebase-admin/firestore";
import { sheetFromAnswerDocs } from "@/lib/response-sheet";

export interface SheetBackfillReport {
  /** Results looked at. */
  responses: number;
  /** Results that already have a sheet. */
  alreadyDone: number;
  /** Results given a sheet (or that would be, in a dry run). */
  built: number;
  /** Results that answered questions but have no answer documents to read (left as they are). */
  unreadable: number;
  applied: boolean;
}

/**
 * Gives every older result an answer sheet built from its `answers/*` documents. Results written since the
 * sheet existed are left alone, and the old documents are never changed or deleted. Safe to run again.
 */
export async function backfillSheets(
  firestore: Firestore,
  { apply = false }: { apply?: boolean } = {}
): Promise<SheetBackfillReport> {
  const report: SheetBackfillReport = { responses: 0, alreadyDone: 0, built: 0, unreadable: 0, applied: apply };
  const writer = apply ? firestore.bulkWriter() : null;

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let page = firestore
      .collection("responses")
      .select("schemaVersion", "answeredCount")
      .orderBy("__name__")
      .limit(200);
    if (cursor) page = page.startAfter(cursor);
    const snap = await page.get();
    if (snap.empty) break;

    const todo = snap.docs.filter((doc) => {
      report.responses += 1;
      if (doc.data().schemaVersion === 2) {
        report.alreadyDone += 1;
        return false;
      }
      return true;
    });
    const answerDocs = await Promise.all(todo.map((doc) => doc.ref.collection("answers").get()));
    todo.forEach((doc, index) => {
      const sheet = sheetFromAnswerDocs(
        answerDocs[index].docs.map((answer) => ({ id: answer.id, data: answer.data() }))
      );
      const answered = doc.data().answeredCount;
      if (Object.keys(sheet).length === 0 && typeof answered === "number" && answered > 0) {
        report.unreadable += 1;
        return;
      }
      report.built += 1;
      writer?.update(doc.ref, { sheet, schemaVersion: 2 });
    });
    cursor = snap.docs[snap.docs.length - 1];
  }

  await writer?.close();
  return report;
}
