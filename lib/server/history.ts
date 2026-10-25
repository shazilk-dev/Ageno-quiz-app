import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import { isSafeId } from "./request";

export interface MyAttemptDTO {
  id: string;
  quizId: string;
  quizTitle: string;
  quizDescription: string;
  startedAt: number;
  submittedAt: number;
  score: number | null;
  tabSwitchCount: number;
  fullscreenExits: number;
  selectedDifficulty: string;
}

const ms = (value: unknown): number =>
  value instanceof Timestamp ? value.toMillis() : 0;

/**
 * A person's own finished attempts, newest first, with quiz titles looked up in one batch. One query for
 * the attempts, one batched read for the titles (it used to be several reads per attempt, one by one).
 */
export async function getMyAttempts(userId: string): Promise<MyAttemptDTO[]> {
  const snapshot = await db
    .collection("responses")
    .where("userId", "==", userId)
    .orderBy("submittedAt", "desc")
    .limit(200)
    .get();

  const quizIds = [
    ...new Set(snapshot.docs.map((doc) => doc.data().quizId as unknown)),
  ].filter(isSafeId);
  const quizDocs = quizIds.length
    ? await db.getAll(...quizIds.map((id) => db.collection("quizzes").doc(id)), {
        fieldMask: ["title", "description"],
      })
    : [];
  const quizzes = new Map(
    quizDocs.map((doc) => [
      doc.id,
      { title: doc.data()?.title as string, description: doc.data()?.description as string },
    ])
  );

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const quiz = quizzes.get(data.quizId);
    return {
      id: doc.id,
      quizId: typeof data.quizId === "string" ? data.quizId : "",
      quizTitle: quiz?.title || "Unknown quiz",
      quizDescription: quiz?.description || "",
      startedAt: ms(data.startedAt),
      submittedAt: ms(data.submittedAt),
      score: typeof data.score === "number" ? data.score : null,
      tabSwitchCount: typeof data.tabSwitchCount === "number" ? data.tabSwitchCount : 0,
      fullscreenExits: typeof data.fullscreenExits === "number" ? data.fullscreenExits : 0,
      selectedDifficulty:
        typeof data.selectedDifficulty === "string" ? data.selectedDifficulty : "medium",
    };
  });
}
