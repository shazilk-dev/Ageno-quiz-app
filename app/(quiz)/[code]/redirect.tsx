"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LobbySkeleton,
  QuizLoadFailed,
  QuizNotFound,
} from "@/components/quiz/lobby/LobbyStates";
import { ApiRequestError } from "@/lib/api-client";
import { rememberCode } from "@/lib/quiz-access";
import { resolveAccessCode } from "@/lib/quizzes-api";

/**
 * Older links look like `/<accessCode>`. The server turns the code into the quiz it belongs to, the code
 * is kept for this session (so the lobby doesn't ask for it again), and the visitor moves on to
 * `/q/<id>`, which is the address that doesn't contain the code.
 */
export default function CodeRedirect({ code }: { code: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"resolving" | "notFound" | "error">(
    "resolving"
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("resolving");
    resolveAccessCode(code)
      .then((quizId) => {
        if (cancelled) return;
        rememberCode(quizId, code);
        router.replace(`/q/${quizId}`);
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(
          error instanceof ApiRequestError && error.status === 404
            ? "notFound"
            : "error"
        );
      });
    return () => {
      cancelled = true;
    };
  }, [code, router, attempt]);

  if (status === "notFound") return <QuizNotFound />;
  if (status === "error") {
    return <QuizLoadFailed onRetry={() => setAttempt((n) => n + 1)} />;
  }
  return <LobbySkeleton />;
}
