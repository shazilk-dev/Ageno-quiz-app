import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import {
  LEADERBOARD_COLLECTION,
  TOTALS_COLLECTION,
  aggregate,
  byRankKey,
  entryAfter,
  entryId,
  totalsAfter,
  totalsFromEntries,
  type EntryDoc,
  type Submission,
  type TotalsDoc,
} from "@/lib/leaderboard-stats";

// Writes to the precomputed leaderboard (`leaderboard`, `userTotals`) and to `quizzes/{id}.responseCount`.
// The shapes and the arithmetic are in `lib/leaderboard-stats.ts`; this file only reads and writes them.

const entries = (firestore: Firestore = db) => firestore.collection(LEADERBOARD_COLLECTION);
const totals = (firestore: Firestore = db) => firestore.collection(TOTALS_COLLECTION);

const nameFrom = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const isNotFound = (error: unknown) => (error as { code?: number }).code === 5;

// ---- the submit transaction ----------------------------------------------------------------------------

export interface BoardRead {
  entry: EntryDoc | null;
  totals: TotalsDoc | null;
  displayName: string | null;
}

/**
 * The submit transaction's reads for the leaderboard (a transaction reads everything before it writes):
 * the person's entry on the quiz, their totals, and their name. All three are the person's own documents,
 * so the only transactions that wait on each other are two submits by the same person.
 */
export async function readBoard(tx: Transaction, quizId: string, userId: string): Promise<BoardRead> {
  const [[entrySnap, totalsSnap], [profile]] = await Promise.all([
    tx.getAll(entries().doc(entryId(quizId, userId)), totals().doc(userId)),
    tx.getAll(db.collection("users").doc(userId), { fieldMask: ["displayName"] }),
  ]);
  return {
    entry: entrySnap.exists ? (entrySnap.data() as EntryDoc) : null,
    totals: totalsSnap.exists ? (totalsSnap.data() as TotalsDoc) : null,
    displayName: nameFrom(profile.data()?.displayName),
  };
}

/** Adds one scored attempt to the person's entry and totals, inside the submit transaction. */
export function writeBoard(tx: Transaction, read: BoardRead, sub: Submission) {
  const entry = entryAfter(read.entry, sub, read.displayName);
  tx.set(entries().doc(entryId(sub.quizId, sub.userId)), entry);
  tx.set(totals().doc(sub.userId), totalsAfter(read.totals, read.entry, entry));
}

// ---- response counts -----------------------------------------------------------------------------------

/**
 * One more result for a quiz. Deliberately not part of the submit transaction: everyone taking a quiz
 * writes this one document, and when a timed exam ends they all submit at once; a transaction that
 * waits on that document would slow or fail the submits. The admin list trusts the count only once
 * `responseCountTracked` is set (a new quiz, or the backfill), so increments on an older quiz before the
 * backfill don't show as a wrong number.
 */
export async function countResponse(quizId: string): Promise<void> {
  try {
    await db.collection("quizzes").doc(quizId).update({ responseCount: FieldValue.increment(1) });
  } catch (error) {
    // The quiz was deleted after the attempt started: nothing to count.
    if (!isNotFound(error)) console.error(`Couldn't count a response for quiz ${quizId}:`, error);
  }
}

// ---- maintenance ---------------------------------------------------------------------------------------

/** Works a person's totals out again from their remaining entries, in a transaction so a submit can't interleave. */
async function recomputeTotals(userId: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const own = await tx.get(entries().where("userId", "==", userId));
    const list = own.docs.map((doc) => doc.data() as EntryDoc);
    const next = totalsFromEntries(userId, list[0]?.displayName ?? null, list);
    if (next) tx.set(totals().doc(userId), next);
    else tx.delete(totals().doc(userId));
  });
}

/** When a quiz and its results are deleted: its entries go, and each person's totals are worked out again. */
export async function removeQuizFromLeaderboard(quizId: string): Promise<void> {
  const people = new Set<string>();
  for (;;) {
    const page = await entries().where("quizId", "==", quizId).select("userId").limit(300).get();
    if (page.empty) break;
    const batch = db.batch();
    for (const doc of page.docs) {
      people.add(doc.get("userId") as string);
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
  for (const userId of people) await recomputeTotals(userId);
}

/**
 * Copies a new display name onto the person's leaderboard rows (`null`: they no longer have one, or the
 * account was deleted, so the board shows a neutral label). Runs after the profile changed.
 */
export async function renameOnLeaderboard(userId: string, displayName: unknown): Promise<void> {
  const name = nameFrom(displayName);
  const [own, total] = await Promise.all([
    entries().where("userId", "==", userId).select().get(),
    totals().doc(userId).get(),
  ]);
  const refs = [...own.docs.map((doc) => doc.ref), ...(total.exists ? [total.ref] : [])];
  for (let start = 0; start < refs.length; start += 450) {
    const batch = db.batch();
    for (const ref of refs.slice(start, start + 450)) batch.update(ref, { displayName: name });
    await batch.commit();
  }
}

// ---- backfill ------------------------------------------------------------------------------------------

export interface BackfillReport {
  responses: number;
  scored: number;
  entries: number;
  people: number;
  /** Leaderboard and totals documents that no result supports any more (deleted below with `apply`). */
  stale: number;
  /** quizId -> number of results, for every quiz that exists. */
  responseCounts: Record<string, number>;
  /** The overall board's first rows, for a look before applying. */
  top: Array<{ userId: string; name: string | null; points: number; quizCount: number; attempts: number }>;
  applied: boolean;
}

const msOf = (value: unknown): number | null => (value instanceof Timestamp ? value.toMillis() : null);

/**
 * Rebuilds `leaderboard` and `userTotals` from every result in `responses`, and sets each quiz's
 * `responseCount`. Dry run unless `apply`. Safe to run again at any time: it computes everything from
 * scratch and removes documents nothing supports. Run it while nobody is submitting: a result that lands
 * mid-run can be missed (running it again picks it up).
 */
export async function backfillLeaderboard(
  firestore: Firestore,
  { apply = false }: { apply?: boolean } = {}
): Promise<BackfillReport> {
  const subs: Submission[] = [];
  const perQuiz = new Map<string, number>();
  let responses = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let page = firestore
      .collection("responses")
      .select("quizId", "userId", "score", "selectedDifficulty", "startedAt", "submittedAt")
      .orderBy("__name__")
      .limit(1000);
    if (cursor) page = page.startAfter(cursor);
    const snap = await page.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const data = doc.data();
      responses += 1;
      const quizId = typeof data.quizId === "string" ? data.quizId : "";
      if (quizId) perQuiz.set(quizId, (perQuiz.get(quizId) ?? 0) + 1);
      if (typeof data.score !== "number" || typeof data.userId !== "string" || !data.userId || !quizId) continue;
      subs.push({
        quizId,
        userId: data.userId,
        score: data.score,
        difficulty: typeof data.selectedDifficulty === "string" ? data.selectedDifficulty : "",
        startedAt: msOf(data.startedAt),
        submittedAt: msOf(data.submittedAt) ?? 0,
      });
    }
    cursor = snap.docs[snap.docs.length - 1];
  }

  const userIds = [...new Set(subs.map((sub) => sub.userId))];
  const names = new Map<string, string | null>();
  for (let start = 0; start < userIds.length; start += 300) {
    const refs = userIds.slice(start, start + 300).map((id) => firestore.collection("users").doc(id));
    const docs = await firestore.getAll(...refs, { fieldMask: ["displayName"] });
    for (const doc of docs) names.set(doc.id, nameFrom(doc.data()?.displayName));
  }

  const built = aggregate(subs, (userId) => names.get(userId) ?? null);
  const wantedEntries = new Set(built.entries.map((entry) => entryId(entry.quizId, entry.userId)));
  const wantedTotals = new Set(built.totals.map((total) => total.userId));
  const [oldEntries, oldTotals, quizDocs] = await Promise.all([
    entries(firestore).select().get(),
    totals(firestore).select().get(),
    firestore.collection("quizzes").select().get(),
  ]);
  const stale = [
    ...oldEntries.docs.filter((doc) => !wantedEntries.has(doc.id)),
    ...oldTotals.docs.filter((doc) => !wantedTotals.has(doc.id)),
  ];
  const responseCounts = Object.fromEntries(quizDocs.docs.map((doc) => [doc.id, perQuiz.get(doc.id) ?? 0]));

  if (apply) {
    const writer = firestore.bulkWriter();
    for (const entry of built.entries) writer.set(entries(firestore).doc(entryId(entry.quizId, entry.userId)), entry);
    for (const total of built.totals) writer.set(totals(firestore).doc(total.userId), total);
    for (const doc of stale) writer.delete(doc.ref);
    for (const doc of quizDocs.docs) {
      writer.update(doc.ref, { responseCount: responseCounts[doc.id], responseCountTracked: true });
    }
    await writer.close();
  }

  return {
    responses,
    scored: subs.length,
    entries: built.entries.length,
    people: built.totals.length,
    stale: stale.length,
    responseCounts,
    top: [...built.totals]
      .sort(byRankKey)
      .slice(0, 10)
      .map((total) => ({
        userId: total.userId,
        name: total.displayName,
        points: total.points,
        quizCount: total.quizCount,
        attempts: total.attempts,
      })),
    applied: apply,
  };
}
