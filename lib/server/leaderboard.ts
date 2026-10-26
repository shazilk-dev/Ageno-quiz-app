import { Timestamp } from "firebase-admin/firestore";
import type { DocumentReference, Query } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import {
  LEADERBOARD_SHOWN,
  buildOverallBoard,
  buildQuizBoard,
  overallEntryFrom,
  publicName,
  quizEntryFrom,
  type BoardDTO,
  type LeaderboardDTO,
  type LeaderboardRow,
} from "@/lib/leaderboard";
import {
  LEADERBOARD_COLLECTION,
  TOTALS_COLLECTION,
  entryId,
  type EntryDoc,
  type TotalsDoc,
} from "@/lib/leaderboard-stats";
import { isLevel, type Level } from "@/lib/quiz-schema";
import { cached } from "./cache";
import { listPublicQuizzes } from "./quizzes";
import { ApiError, isSafeId } from "./request";

export type { LeaderboardDTO } from "@/lib/leaderboard";
export type TimeFrame = "all" | "week" | "month";

/** A week or month board is worked out from that period's results: at most this many, newest first. */
export const PERIOD_READ_LIMIT = 5000;
/** How long one week or month board is reused for everyone (the leaderboard may be 30 s behind). */
const PERIOD_CACHE_SECONDS = 30;

interface Filters {
  timeFrame: TimeFrame;
  quizId: string | null;
  level: Level | null;
}

function parseFilters(filters: { timeFrame?: unknown; quizId?: unknown; difficulty?: unknown }): Filters {
  const timeFrame = filters.timeFrame ?? "all";
  if (timeFrame !== "all" && timeFrame !== "week" && timeFrame !== "month") {
    throw new ApiError(400, "invalid_filter", "Unknown time frame.");
  }
  const quizId = filters.quizId || null;
  if (quizId !== null && !isSafeId(quizId)) {
    throw new ApiError(400, "invalid_filter", "Unknown quiz.");
  }
  const level = filters.difficulty || null;
  if (level !== null && !isLevel(level)) {
    throw new ApiError(400, "invalid_filter", "Unknown difficulty.");
  }
  return { timeFrame, quizId, level };
}

/**
 * The leaderboard under the given filters, ranked on the server: the first {@link LEADERBOARD_SHOWN} rows,
 * how many people are ranked, and the viewer's own row wherever they are. All-time boards read the
 * precomputed `leaderboard` and `userTotals` documents (one indexed query); week and month boards are
 * worked out from that period's results. Only display names leave the server, never emails.
 */
export async function getLeaderboard(
  filters: { timeFrame?: unknown; quizId?: unknown; difficulty?: unknown },
  viewerId: string | null = null
): Promise<LeaderboardDTO> {
  const { timeFrame, quizId, level } = parseFilters(filters);
  const [board, publicQuizzes] = await Promise.all([
    timeFrame === "all" ? allTimeBoard(quizId, level, viewerId) : periodBoard(timeFrame, quizId, level, viewerId),
    listPublicQuizzes(),
  ]);
  return { ...board, quizzes: Object.fromEntries(publicQuizzes.map((quiz) => [quiz.id, quiz.title])) };
}

// ---- all time: precomputed ---------------------------------------------------------------------------

/**
 * The first rows of `query` (already ordered by `field`, best first), how many it ranks, and the
 * viewer's own row: from the rows if they're among them, otherwise their document plus a `count()` of
 * the keys above theirs.
 */
async function rankedRows<D, E extends { userId: string }>(
  query: Query,
  field: string,
  viewer: { id: string; ref: DocumentReference } | null,
  toEntry: (id: string, doc: D, rank: number) => E | null,
  keyOf: (doc: D) => string | undefined
): Promise<{ entries: E[]; me: E | null; total: number }> {
  const [top, count, own] = await Promise.all([
    query.limit(LEADERBOARD_SHOWN).get(),
    query.count().get(),
    viewer ? viewer.ref.get() : null,
  ]);
  const entries = top.docs.flatMap((doc, index) => toEntry(doc.id, doc.data() as D, index + 1) ?? []);
  const total = count.data().count;
  let me = entries.find((entry) => entry.userId === viewer?.id) ?? null;
  if (!me && own?.exists) {
    const data = own.data() as D;
    const key = keyOf(data);
    if (key) {
      const ahead = (await query.where(field, ">", key).count().get()).data().count;
      me = toEntry(own.id, data, ahead + 1);
    }
  }
  return { entries, me, total };
}

async function allTimeBoard(quizId: string | null, level: Level | null, viewerId: string | null): Promise<BoardDTO> {
  // One quiz or every quiz, at every level or one: the matching stat and its rank key.
  const field = level ? `levels.${level}.rankKey` : "rankKey";

  if (quizId) {
    const statOf = (doc: EntryDoc) => (level ? doc.levels?.[level] : doc);
    const board = await rankedRows<EntryDoc, ReturnType<typeof quizEntryFrom>>(
      db.collection(LEADERBOARD_COLLECTION).where("quizId", "==", quizId).orderBy(field, "desc"),
      field,
      viewerId ? { id: viewerId, ref: db.collection(LEADERBOARD_COLLECTION).doc(entryId(quizId, viewerId)) } : null,
      (id, doc, rank) => {
        const stat = statOf(doc);
        return stat ? quizEntryFrom(id, doc.userId, publicName(doc.userId, doc.displayName), stat, rank) : null;
      },
      (doc) => statOf(doc)?.rankKey
    );
    return { mode: "quiz", ...board };
  }

  const statOf = (doc: TotalsDoc) => (level ? doc.levels?.[level] : doc);
  const board = await rankedRows<TotalsDoc, ReturnType<typeof overallEntryFrom>>(
    db.collection(TOTALS_COLLECTION).orderBy(field, "desc"),
    field,
    viewerId ? { id: viewerId, ref: db.collection(TOTALS_COLLECTION).doc(viewerId) } : null,
    (_id, doc, rank) => {
      const stat = statOf(doc);
      return stat ? overallEntryFrom(doc.userId, publicName(doc.userId, doc.displayName), stat, rank) : null;
    },
    (doc) => statOf(doc)?.rankKey
  );
  return { mode: "overall", ...board };
}

// ---- week and month: from the period's results ---------------------------------------------------------

const ms = (value: unknown): number | null => (value instanceof Timestamp ? value.toMillis() : null);

/** Everyone ranked for one period and filter. Shared by every viewer, so it goes through the data cache. */
async function periodRanking(timeFrame: "week" | "month", quizId: string | null, level: Level | null): Promise<BoardDTO> {
  const since = new Date();
  if (timeFrame === "week") since.setDate(since.getDate() - 7);
  else since.setMonth(since.getMonth() - 1);

  let query: Query = db.collection("responses");
  if (quizId) query = query.where("quizId", "==", quizId);
  const snapshot = await query
    .where("submittedAt", ">=", Timestamp.fromDate(since))
    .orderBy("submittedAt", "desc")
    .select("userId", "quizId", "score", "selectedDifficulty", "startedAt", "submittedAt")
    .limit(PERIOD_READ_LIMIT)
    .get();
  if (snapshot.size === PERIOD_READ_LIMIT) {
    console.warn(`Leaderboard (${timeFrame}${quizId ? `, quiz ${quizId}` : ""}) read only the newest ${PERIOD_READ_LIMIT} results.`);
  }

  const rows: LeaderboardRow[] = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        userId: typeof data.userId === "string" ? data.userId : "",
        quizId: typeof data.quizId === "string" ? data.quizId : "",
        score: typeof data.score === "number" ? data.score : null,
        selectedDifficulty: typeof data.selectedDifficulty === "string" ? data.selectedDifficulty : "",
        startedAt: ms(data.startedAt),
        submittedAt: ms(data.submittedAt),
      };
    })
    .filter((row) => !level || row.selectedDifficulty === level);

  const board: BoardDTO = quizId
    ? { mode: "quiz", entries: buildQuizBoard(rows, {}), me: null, total: 0 }
    : { mode: "overall", entries: buildOverallBoard(rows, {}), me: null, total: 0 };

  // Names only for the rows shown, in one batched read (the viewer's own row further down shows no name).
  const shownIds = board.entries.slice(0, LEADERBOARD_SHOWN).map((entry) => entry.userId).filter(isSafeId);
  const profiles = shownIds.length
    ? await db.getAll(...shownIds.map((id) => db.collection("users").doc(id)), { fieldMask: ["displayName"] })
    : [];
  const names = new Map(profiles.map((doc) => [doc.id, publicName(doc.id, doc.data()?.displayName)]));
  for (const entry of board.entries) entry.username = names.get(entry.userId) ?? entry.username;
  return { ...board, total: board.entries.length };
}

async function periodBoard(
  timeFrame: "week" | "month",
  quizId: string | null,
  level: Level | null,
  viewerId: string | null
): Promise<BoardDTO> {
  const ranking = await cached(
    ["leaderboard", timeFrame, quizId ?? "", level ?? ""],
    [],
    () => periodRanking(timeFrame, quizId, level),
    PERIOD_CACHE_SECONDS
  );
  return ranking.mode === "quiz"
    ? {
        ...ranking,
        entries: ranking.entries.slice(0, LEADERBOARD_SHOWN),
        me: ranking.entries.find((entry) => entry.userId === viewerId) ?? null,
      }
    : {
        ...ranking,
        entries: ranking.entries.slice(0, LEADERBOARD_SHOWN),
        me: ranking.entries.find((entry) => entry.userId === viewerId) ?? null,
      };
}
