"use client";

import { useCallback, useEffect, useState } from "react";
import { getQuizByCode, type Quiz } from "@/firebase/firestore";
import { fetchQuestionCounts } from "@/lib/exam/api";
import type { QuestionCounts } from "@/lib/exam/types";
import { getRecommendedDifficulty } from "@/utils/difficulty-helpers";

type QuizStatus = "loading" | "ready" | "notFound" | "error";
export type QuestionsStatus = "loading" | "ready" | "empty" | "error";

/**
 * Loads a quiz by its code and how many questions each level has. The questions themselves are not
 * loaded here: they arrive, without their answers, when an attempt starts.
 */
export function useQuizLoader(code: string) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [status, setStatus] = useState<QuizStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const [difficulty, setDifficulty] = useState("medium");
  const [counts, setCounts] = useState<QuestionCounts | null>(null);
  const [countsFailed, setCountsFailed] = useState(false);
  const [countsKey, setCountsKey] = useState(0);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    setStatus("loading");
    getQuizByCode(code)
      .then((found) => {
        if (cancelled) return;
        if (!found) {
          setStatus("notFound");
          return;
        }
        setQuiz(found);
        setDifficulty(getRecommendedDifficulty(found));
        setCounts(null);
        setCountsFailed(false);
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Error fetching quiz:", error);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [code, reloadKey]);

  const quizId = quiz?.id;
  useEffect(() => {
    if (!quizId) return;
    let cancelled = false;

    setCounts(null);
    setCountsFailed(false);
    fetchQuestionCounts(quizId)
      .then((loaded) => {
        if (!cancelled) setCounts(loaded);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Error loading question counts:", error);
        setCountsFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [quizId, countsKey]);

  const questionCount = counts?.[difficulty] ?? 0;
  const questionsStatus: QuestionsStatus = countsFailed
    ? "error"
    : counts === null
      ? "loading"
      : questionCount > 0
        ? "ready"
        : "empty";

  return {
    quiz,
    status,
    reload: useCallback(() => setReloadKey((key) => key + 1), []),
    difficulty,
    selectDifficulty: setDifficulty,
    questionCount,
    questionsStatus,
    reloadCounts: useCallback(() => setCountsKey((key) => key + 1), []),
  };
}
