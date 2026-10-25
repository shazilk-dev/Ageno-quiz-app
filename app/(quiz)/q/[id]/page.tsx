import { Suspense } from "react";
import type { Metadata } from "next";
import { LobbySkeleton } from "@/components/quiz/lobby/LobbyStates";
import QuizClient from "./client";

export const metadata: Metadata = {
  title: "Quiz",
  description: "Take a quiz on Ageno Quiz.",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return (
    <Suspense fallback={<LobbySkeleton />}>
      <QuizClient quizId={id} />
    </Suspense>
  );
}
