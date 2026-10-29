import { AggregateField, Timestamp } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import { dayWindows, integrityAlerts, lowAverageAlerts } from "@/lib/admin-analytics";
import type { AttentionItem, DashboardData, ReportRow, ReportsPage, TrendDay } from "@/lib/admin-types";
import { cached } from "./cache";
import { ApiError, isMissingIndex, isSafeId } from "./request";

// What the admin dashboard and the reports page read. Everything is a bounded query: counts and the average
// come from aggregation queries (no documents are read), result rows come a page at a time with only the
// fields the screens use, and the quiz titles and people's names for a page are fetched in one batch.

export const DEFAULT_PAGE = 200;
export const MAX_PAGE = 500;

const FIELDS = [
  "quizId",
  "userId",
  "score",
  "startedAt",
  "submittedAt",
  "tabSwitchCount",
  "fullscreenExits",
  "blurCount",
  "selectedDifficulty",
] as const;

const ms = (value: unknown): number | null =>
  value instanceof Timestamp ? value.toMillis() : null;
const count = (value: unknown): number => (typeof value === "number" ? value : 0);

/** `getAll` in chunks, so a long page never builds one enormous request. */
export async function namesFor(
  collection: "quizzes" | "users",
  ids: string[],
  pick: (data: FirebaseFirestore.DocumentData) => string,
  fieldMask: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let start = 0; start < ids.length; start += 300) {
    const refs = ids.slice(start, start + 300).map((id) => db.collection(collection).doc(id));
    for (const doc of await db.getAll(...refs, { fieldMask })) {
      const data = doc.data();
      if (data) names.set(doc.id, pick(data));
    }
  }
  return names;
}

async function toRows(docs: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<ReportRow[]> {
  const quizIds = [...new Set(docs.map((doc) => doc.data().quizId as unknown))].filter(isSafeId);
  const userIds = [...new Set(docs.map((doc) => doc.data().userId as unknown))].filter(isSafeId);
  const [quizTitles, userNames] = await Promise.all([
    namesFor("quizzes", quizIds, (data) => String(data.title || ""), ["title"]),
    namesFor("users", userIds, (data) => String(data.displayName || data.email || ""), ["displayName", "email"]),
  ]);

  return docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      quizId: typeof data.quizId === "string" ? data.quizId : "",
      quizTitle: quizTitles.get(data.quizId) || "Unknown quiz",
      userId: typeof data.userId === "string" ? data.userId : "",
      userName: userNames.get(data.userId) || "Unknown user",
      score: typeof data.score === "number" ? data.score : null,
      startedAt: ms(data.startedAt),
      submittedAt: ms(data.submittedAt),
      tabSwitchCount: count(data.tabSwitchCount),
      fullscreenExits: count(data.fullscreenExits),
      blurCount: count(data.blurCount),
      difficulty: typeof data.selectedDifficulty === "string" ? data.selectedDifficulty : "medium",
    };
  });
}

/**
 * One page of finished results, newest first, plus the quiz list for the filter. With `quizId` only that
 * quiz's results (and its total) come back; with `userId` only that person's, and `person` says who. Each
 * needs its own composite index with `submittedAt` (firestore.indexes.json); until it is deployed the query is
 * refused with `index_required`. The two filters are not combined (that would be a third index).
 */
export async function getReportsPage(
  limit: unknown,
  cursor: unknown,
  quizId?: unknown,
  userId?: unknown
): Promise<ReportsPage> {
  const size = Math.min(
    MAX_PAGE,
    Math.max(1, typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_PAGE)
  );

  const byQuiz = quizId !== undefined && quizId !== null && quizId !== "";
  const byPerson = userId !== undefined && userId !== null && userId !== "";
  if (byQuiz && byPerson) {
    throw new ApiError(400, "invalid_filter", "Pick a quiz or a person, not both.");
  }
  if (byQuiz && !isSafeId(quizId)) throw new ApiError(400, "invalid_id", "That quiz isn't valid.");
  if (byPerson && !isSafeId(userId)) throw new ApiError(400, "invalid_id", "That person isn't valid.");
  const filtered = byQuiz || byPerson;
  const scope = byQuiz
    ? db.collection("responses").where("quizId", "==", quizId)
    : byPerson
      ? db.collection("responses").where("userId", "==", userId)
      : db.collection("responses");

  let query = scope
    .orderBy("submittedAt", "desc")
    .select(...FIELDS)
    .limit(size + 1);
  if (cursor !== undefined && cursor !== null && cursor !== "") {
    if (!isSafeId(cursor)) throw new ApiError(400, "invalid_cursor", "That page isn't valid.");
    const after = await db.collection("responses").doc(cursor).get();
    if (!after.exists) throw new ApiError(400, "invalid_cursor", "That page isn't valid.");
    query = query.startAfter(after);
  }

  let snapshot: FirebaseFirestore.QuerySnapshot;
  let total: FirebaseFirestore.AggregateQuerySnapshot<{ count: FirebaseFirestore.AggregateField<number> }>;
  let quizSnapshot: FirebaseFirestore.QuerySnapshot;
  try {
    [snapshot, total, quizSnapshot] = await Promise.all([
      query.get(),
      scope.count().get(),
      db.collection("quizzes").select("title").get(),
    ]);
  } catch (error) {
    if (filtered && isMissingIndex(error)) {
      throw new ApiError(
        503,
        "index_required",
        byPerson
          ? "Looking up one person's results isn't ready yet."
          : "Filtering by quiz isn't ready yet. Showing every quiz's results instead."
      );
    }
    throw error;
  }

  const hasMore = snapshot.size > size;
  const docs = snapshot.docs.slice(0, size);
  const person = byPerson
    ? {
        id: userId as string,
        name: (await namesFor("users", [userId as string], (data) => String(data.displayName || data.email || ""), ["displayName", "email"])).get(userId as string) || "Unknown user",
      }
    : null;
  return {
    rows: await toRows(docs),
    nextCursor: hasMore ? docs[docs.length - 1].id : null,
    total: total.data().count,
    person,
    quizzes: quizSnapshot.docs
      .map((doc) => ({ id: doc.id, title: String(doc.data().title || "Untitled quiz") }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  };
}

const RECENT_FOR_CHARTS = 50;
/** Quizzes whose average is checked for "needs attention" (the newest ones), one aggregation query each. */
const QUIZZES_CHECKED = 40;

/**
 * The dashboard's 30-day trend (one count query per day) and the quizzes with a low average (one aggregation
 * query per quiz). Both are counts, so no result document is read, and both are kept five minutes in the
 * data cache: a handful of seconds of delay on a dashboard is fine, and 70 queries on every load is not.
 */
async function loadTrendAndAverages(): Promise<{ trend: TrendDay[]; lowAverage: AttentionItem[] }> {
  const windows = dayWindows(Date.now());
  const [trend, quizzes] = await Promise.all([
    Promise.all(
      windows.map(async ({ day, start, end }): Promise<TrendDay> => {
        const snap = await db
          .collection("responses")
          .where("submittedAt", ">=", Timestamp.fromMillis(start))
          .where("submittedAt", "<", Timestamp.fromMillis(end))
          .count()
          .get();
        return { day, results: snap.data().count };
      })
    ),
    db.collection("quizzes").orderBy("createdAt", "desc").limit(QUIZZES_CHECKED).select("title", "deletedAt").get(),
  ]);

  // An average per quiz needs the `quizId` + `score` index (firestore.indexes.json). Until it is deployed
  // this part of the strip is simply empty: the dashboard itself must not fail over it.
  let lowAverage: AttentionItem[] = [];
  try {
    const stats = await Promise.all(
      quizzes.docs
        .filter((doc) => !doc.data().deletedAt)
        .map(async (doc) => {
          const snap = await db
            .collection("responses")
            .where("quizId", "==", doc.id)
            .aggregate({ results: AggregateField.count(), average: AggregateField.average("score") })
            .get();
          const { results, average } = snap.data();
          return { quizId: doc.id, title: String(doc.data().title || "Untitled quiz"), results, average };
        })
    );
    lowAverage = lowAverageAlerts(stats);
  } catch (error) {
    if (!isMissingIndex(error)) throw error;
  }
  return { trend, lowAverage };
}

export async function getDashboard(): Promise<DashboardData> {
  const [users, quizzes, attempts, recentQuizzes, recent] = await Promise.all([
    db.collection("users").count().get(),
    // Quizzes in the trash are not counted as quizzes.
    Promise.all([
      db.collection("quizzes").count().get(),
      db.collection("quizzes").where("deletedAt", ">", Timestamp.fromMillis(0)).count().get(),
    ]),
    db
      .collection("responses")
      .aggregate({ total: AggregateField.count(), average: AggregateField.average("score") })
      .get(),
    db.collection("quizzes").orderBy("createdAt", "desc").limit(15).select("title", "createdAt", "deletedAt").get(),
    db
      .collection("responses")
      .orderBy("submittedAt", "desc")
      .select(...FIELDS)
      .limit(RECENT_FOR_CHARTS)
      .get(),
  ]);

  const { total, average } = attempts.data();
  const { trend, lowAverage } = await cached(["dashboard-trend"], ["admin-dashboard"], loadTrendAndAverages, 300);
  const recentRows = await toRows(recent.docs);
  return {
    totals: {
      users: users.data().count,
      quizzes: Math.max(0, quizzes[0].data().count - quizzes[1].data().count),
      attempts: total,
      averageScore: average === null ? 0 : Math.round(average),
    },
    recentQuizzes: recentQuizzes.docs
      .filter((doc) => !doc.data().deletedAt)
      .slice(0, 5)
      .map((doc) => ({
        id: doc.id,
        title: String(doc.data().title || "Untitled quiz"),
        createdAt: ms(doc.data().createdAt) ?? 0,
      })),
    trend,
    attention: [...lowAverage, ...integrityAlerts(recentRows)],
    recent: recentRows,
  };
}
