"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button } from "@/components/ui";
import type { QuizAttemptApi } from "@/hooks/useQuizAttempt";
import type { PublicQuiz } from "@/lib/quiz-data";
import ResultsScreen from "./ResultsScreen";

interface ResultsViewProps {
  quiz: PublicQuiz;
  attempt: QuizAttemptApi;
  difficulty: string;
  signedIn: boolean;
  /** Starts a new attempt. Rejects with a message for the person if it can't. */
  onRetry: () => Promise<void>;
  onExit: () => void;
}

/** The results straight after a submit: the shared screen plus Retry and the way out. */
export default function ResultsView({
  quiz,
  attempt,
  difficulty,
  signedIn,
  onRetry,
  onExit,
}: ResultsViewProps) {
  const { questions, result } = attempt;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (!result || !result.answers) return null;

  const handleRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      await onRetry();
    } catch (error) {
      setRetryError(
        error instanceof Error ? error.message : "We couldn't start a new attempt."
      );
      setRetrying(false);
    }
  };

  return (
    <ResultsScreen
      title={quiz.title}
      questions={questions}
      result={result}
      difficulty={difficulty}
      actions={
        <>
          {signedIn ? (
            <Button asChild>
              <Link href="/my-quizzes">View my attempts</Link>
            </Button>
          ) : (
            <Button onClick={onExit}>Back to quizzes</Button>
          )}
          {signedIn && (
            <Button variant="secondary" onClick={onExit}>
              Back to quizzes
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => void handleRetry()}
            loading={retrying}
          >
            Retry quiz
          </Button>
          {retryError && <Alert variant="error">{retryError}</Alert>}
          {!signedIn && (
            <p className="mt-1 text-center text-sm text-text-muted">
              <Link
                href="/sign-in"
                className="text-link underline underline-offset-4 hover:no-underline"
              >
                Sign in
              </Link>{" "}
              to keep your attempts in one place.
            </p>
          )}
        </>
      }
    />
  );
}
