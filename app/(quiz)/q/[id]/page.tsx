import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LobbySkeleton } from "@/components/quiz/lobby/LobbyStates";
import type { QuizInfoDTO } from "@/lib/player-data";
import { getPublicQuiz } from "@/lib/server/quizzes";
import QuizClient from "./client";

type PageProps = { params: Promise<{ id: string }> };

// Each lobby is rendered on its first visit and then served as a static page from the CDN, rebuilt when an
// admin changes the quiz (its `quiz:<id>` cache tag) and at most every 5 minutes otherwise. Nothing about
// the visitor is in it: who is signed in and any unfinished attempt are worked out in the browser.
export const revalidate = 300;
export async function generateStaticParams() {
  return [];
}

/** The public quiz, "missing", or `null` when the server couldn't tell (the browser then tries itself). */
const loadLobby = cache(async (id: string): Promise<QuizInfoDTO | "missing" | null> => {
  try {
    return await getPublicQuiz(id);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || status === 400) return "missing";
    console.error("Could not load the quiz lobby:", error);
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const info = await loadLobby((await params).id);
  if (info && info !== "missing") {
    return { title: info.quiz.title, description: info.quiz.description || "Take a quiz on Ageno Quiz." };
  }
  return { title: "Quiz", description: "Take a quiz on Ageno Quiz." };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const info = await loadLobby(id);
  if (info === "missing") notFound();
  return (
    <Suspense fallback={<LobbySkeleton />}>
      <QuizClient quizId={id} initial={info} />
    </Suspense>
  );
}
