"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError } from "@/lib/api-client";
import type { QuestionCounts } from "@/lib/exam/types";
import type { PublicQuiz } from "@/lib/quiz-data";
import { quizInfoFromDTO, type QuizInfoDTO } from "@/lib/player-data";
import { fetchQuiz } from "@/lib/quizzes-api";
import { getRecommendedDifficulty } from "@/utils/difficulty-helpers";

type QuizStatus = "loading" | "ready" | "notFound" | "error";
export type QuestionsStatus = "loading" | "ready" | "empty" | "error";

/**
 * Loads a quiz for its lobby in one request: the quiz as a player may see it (no access code) and how
 * many questions each level has. The questions themselves arrive, without their answers, when an
 * attempt starts. When the page was rendered with the quiz (`initial`), nothing is fetched until a reload.
 */
export function useQuizLoader(quizId: string, initial: QuizInfoDTO | null = null) {
  const [seed] = useState(() => (initial ? quizInfoFromDTO(initial) : null));
  const [quiz, setQuiz] = useState<PublicQuiz | null>(seed?.quiz ?? null);
  const [active, setActive] = useState(seed?.active ?? true);
  const [counts, setCounts] = useState<QuestionCounts>(seed?.counts ?? {});
  const [status, setStatus] = useState<QuizStatus>(seed ? "ready" : "loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [difficulty, setDifficulty] = useState(() =>
    seed ? getRecommendedDifficulty(seed.quiz) : "medium"
  );

  useEffect(() => {
    if (!quizId) return;
    if (seed && reloadKey === 0) return;
    let cancelled = false;

    setStatus("loading");
    fetchQuiz(quizId)
      .then((info) => {
        if (cancelled) return;
        setQuiz(info.quiz);
        setActive(info.active);
        setCounts(info.counts);
        setDifficulty(getRecommendedDifficulty(info.quiz));
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiRequestError && error.status === 404) {
          setStatus("notFound");
          return;
        }
        console.error("Error fetching quiz:", error);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [quizId, reloadKey, seed]);

  const questionCount = counts[difficulty] ?? 0;
  const questionsStatus: QuestionsStatus =
    status === "error"
      ? "error"
      : status !== "ready"
        ? "loading"
        : questionCount > 0
          ? "ready"
          : "empty";

  return {
    quiz,
    active,
    status,
    reload: useCallback(() => setReloadKey((key) => key + 1), []),
    difficulty,
    selectDifficulty: setDifficulty,
    questionCount,
    questionsStatus,
  };
}
