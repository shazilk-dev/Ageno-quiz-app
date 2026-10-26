"use client";

import { format } from "date-fns";
import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Container } from "@/components/layout/Container";
import ResultsScreen from "@/components/quiz/exam/ResultsScreen";
import { Alert, Button, EmptyState, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { ApiRequestError, fetchAttemptResult } from "@/lib/exam/api";
import type { AttemptResult } from "@/lib/exam/types";

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: AttemptResult }
  | { kind: "missing" }
  | { kind: "unfinished" }
  | { kind: "failed"; message: string };

const BackToList = () => (
  <Button asChild variant="secondary">
    <Link href="/my-quizzes">Back to my quizzes</Link>
  </Button>
);

/** One finished attempt, opened again from My quizzes: the same results screen as right after the quiz. */
export default function AttemptReview() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { user } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", data: await fetchAttemptResult(attemptId) });
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "attempt_not_found") {
        setState({ kind: "missing" });
      } else if (error instanceof ApiRequestError && error.code === "attempt_not_finished") {
        setState({ kind: "unfinished" });
      } else {
        setState({
          kind: "failed",
          message:
            error instanceof ApiRequestError
              ? error.message
              : "Check your connection and try again.",
        });
      }
    }
  }, [attemptId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (state.kind === "ready") {
    const { data } = state;
    return (
      <ResultsScreen
        title={data.quizTitle}
        subtitle={format(new Date(data.submittedAt), "MMM d, yyyy 'at' h:mm a")}
        questions={data.questions}
        result={data.result}
        difficulty={data.difficulty}
        actions={
          <>
            <Button asChild>
              <Link href="/my-quizzes">Back to my quizzes</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/q/${encodeURIComponent(data.quizId)}`}>
                Take this quiz again
              </Link>
            </Button>
          </>
        }
      />
    );
  }

  return (
    <div data-theme="dark" className="flex-1 bg-bg text-text">
      <Container className="py-8 sm:py-10">
        {state.kind === "loading" ? (
          <div aria-busy="true" aria-label="Loading your results">
            <Skeleton className="h-9 w-56" />
            <div className="mt-8 grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <Skeleton className="h-96 w-full rounded-lg" />
              <div className="space-y-4">
                <Skeleton className="h-40 w-full rounded-lg" />
                <Skeleton className="h-40 w-full rounded-lg" />
              </div>
            </div>
          </div>
        ) : state.kind === "failed" ? (
          <Alert
            variant="error"
            title="We couldn't load these results"
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : (
          <EmptyState
            icon={FileQuestion}
            title={
              state.kind === "unfinished"
                ? "This attempt isn't finished"
                : "We couldn't find that attempt"
            }
            description={
              state.kind === "unfinished"
                ? "Results appear here once you've submitted it."
                : "It may belong to a different account, or it may have been removed."
            }
            action={<BackToList />}
          />
        )}
      </Container>
    </div>
  );
}
