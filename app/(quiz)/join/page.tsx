import type { Metadata } from "next";
import { listPublicQuizzes } from "@/lib/server/quizzes";
import type { PublicQuizDTO } from "@/lib/quiz-data";
import JoinClient from "./JoinClient";

export const metadata: Metadata = {
  title: "Join a quiz",
  description: "Pick a quiz from the list, or enter the access code you were given.",
};

// A static page with the list already in it, served from the CDN. It is rebuilt when an admin changes a
// quiz (the list's `quizzes` cache tag) and at most every 5 minutes otherwise.
export const revalidate = 300;

export default async function JoinPage() {
  let quizzes: PublicQuizDTO[] | null = null;
  try {
    quizzes = await listPublicQuizzes();
  } catch (error) {
    // The browser loads the list itself instead, with its own error and retry.
    console.error("Could not load the quiz list for the join page:", error);
  }
  return <JoinClient initialQuizzes={quizzes} />;
}
