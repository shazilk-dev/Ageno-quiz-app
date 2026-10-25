import { Timestamp } from "firebase-admin/firestore";
import type { Query } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import { ApiError, isSafeId } from "./request";
import { listPublicQuizzes } from "./quizzes";

export type TimeFrame = "all" | "week" | "month";

export interface LeaderboardRowDTO {
  id: string;
  userId: string;
  quizId: string;
  score: number | null;
  selectedDifficulty: string;
  startedAt: number | null;
  submittedAt: number | null;
}

export interface LeaderboardDTO {
  rows: LeaderboardRowDTO[];
  /** userId -> name to show. Never an email address. */
  users: Record<string, string>;
  /** quizId -> title, for every quiz people can pick, so the filter list and the rows agree. */
  quizzes: Record<string, string>;
}

const ms = (value: unknown): number | null =>
  value instanceof Timestamp ? value.toMillis() : null;

/** What other people see of a person: the name they chose, or a short neutral label. */
const displayName = (id: string, name: unknown): string =>
  typeof name === "string" && name.trim() ? name.trim() : `User ${id.slice(0, 6)}`;

/**
 * The rows behind the leaderboard, with names and titles already looked up in one batch each (the
 * browser used to fetch them one by one). Only display names leave the server, never emails.
 */
export async function getLeaderboard(filters: {
  timeFrame?: unknown;
  quizId?: unknown;
  difficulty?: unknown;
}): Promise<LeaderboardDTO> {
  const timeFrame = filters.timeFrame ?? "all";
  if (timeFrame !== "all" && timeFrame !== "week" && timeFrame !== "month") {
    throw new ApiError(400, "invalid_filter", "Unknown time frame.");
  }
  const quizId = filters.quizId || null;
  if (quizId !== null && !isSafeId(quizId)) {
    throw new ApiError(400, "invalid_filter", "Unknown quiz.");
  }
  const difficulty = filters.difficulty || null;
  if (difficulty !== null && (typeof difficulty !== "string" || !/^[a-z]{1,20}$/.test(difficulty))) {
    throw new ApiError(400, "invalid_filter", "Unknown difficulty.");
  }

  let query: Query = db.collection("responses");
  if (timeFrame !== "all") {
    const since = new Date();
    if (timeFrame === "week") since.setDate(since.getDate() - 7);
    else since.setMonth(since.getMonth() - 1);
    query = query.where("submittedAt", ">=", Timestamp.fromDate(since));
  }
  if (quizId) query = query.where("quizId", "==", quizId);
  if (difficulty) query = query.where("selectedDifficulty", "==", difficulty);

  const [snapshot, publicQuizzes] = await Promise.all([
    query.orderBy("score", "desc").limit(100).get(),
    listPublicQuizzes(),
  ]);

  const rows: LeaderboardRowDTO[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: typeof data.userId === "string" ? data.userId : "",
      quizId: typeof data.quizId === "string" ? data.quizId : "",
      score: typeof data.score === "number" ? data.score : null,
      selectedDifficulty:
        typeof data.selectedDifficulty === "string" ? data.selectedDifficulty : "",
      startedAt: ms(data.startedAt),
      submittedAt: ms(data.submittedAt),
    };
  });

  const quizzes: Record<string, string> = Object.fromEntries(
    publicQuizzes.map((quiz) => [quiz.id, quiz.title])
  );

  // One batched read for every name and every quiz title we still need.
  const userIds = [...new Set(rows.map((row) => row.userId))].filter(isSafeId);
  const missingQuizIds = [...new Set(rows.map((row) => row.quizId))].filter(
    (id) => isSafeId(id) && !(id in quizzes)
  );
  const [userDocs, quizDocs] = await Promise.all([
    userIds.length
      ? db.getAll(...userIds.map((id) => db.collection("users").doc(id)), {
          fieldMask: ["displayName"],
        })
      : [],
    missingQuizIds.length
      ? db.getAll(...missingQuizIds.map((id) => db.collection("quizzes").doc(id)), {
          fieldMask: ["title"],
        })
      : [],
  ]);

  const users: Record<string, string> = {};
  for (const doc of userDocs) users[doc.id] = displayName(doc.id, doc.data()?.displayName);
  for (const id of userIds) users[id] ??= displayName(id, null);
  for (const doc of quizDocs) {
    quizzes[doc.id] = (doc.data()?.title as string) || `Quiz ${doc.id.slice(0, 6)}`;
  }

  return { rows, users, quizzes };
}
