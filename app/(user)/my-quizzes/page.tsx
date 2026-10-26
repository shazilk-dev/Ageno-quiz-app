import type { Metadata } from "next";
import { getMyAttempts, type MyAttemptDTO } from "@/lib/server/history";
import { getSessionUser } from "@/lib/server/session";
import MyQuizzesClient from "./MyQuizzesClient";

export const metadata: Metadata = { title: "My quizzes" };

/** Rendered with the person's attempts already in it; the browser fetches them only if this couldn't. */
export default async function MyQuizzesPage() {
  const session = await getSessionUser();
  let attempts: MyAttemptDTO[] | null = null;
  if (session) {
    try {
      attempts = await getMyAttempts(session.uid);
    } catch (error) {
      console.error("Could not load attempts for My quizzes:", error);
    }
  }
  return <MyQuizzesClient initialAttempts={attempts} />;
}
