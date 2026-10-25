"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Container } from "@/components/layout/Container";
import { Alert, Badge, Button, Card, FilterTabs } from "@/components/ui";
import type { Quiz } from "@/firebase/firestore";
import type { QuizAttemptApi } from "@/hooks/useQuizAttempt";
import { formatClock, getQuestionStatus } from "@/lib/exam/answers";
import QuestionReview from "./QuestionReview";

type ReviewFilter = "all" | "incorrect" | "unanswered";

interface ResultsViewProps {
  quiz: Quiz;
  attempt: QuizAttemptApi;
  difficulty: string;
  signedIn: boolean;
  /** Starts a new attempt. Rejects with a message for the person if it can't. */
  onRetry: () => Promise<void>;
  onExit: () => void;
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Score, what it's made of, a plain note on the difficulty multiplier, and (unless the quiz owner turned
 * it off) a question-by-question review. Every number and the review itself come from the server's
 * result; the browser never knew which options were right until now.
 */
export default function ResultsView({
  quiz,
  attempt,
  difficulty,
  signedIn,
  onRetry,
  onExit,
}: ResultsViewProps) {
  const { questions, result, tabSwitches, fullscreenExits } = attempt;
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A new screen: start at the top and tell screen readers where they are.
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus();
  }, []);

  const review = result?.review ?? null;
  const answers = result?.answers;

  const statuses = useMemo(
    () =>
      new Map(
        questions.map((question) => [
          question.id,
          getQuestionStatus(
            review?.[question.id]?.correctIndex ?? null,
            answers?.[question.id]
          ),
        ])
      ),
    [questions, review, answers]
  );

  if (!result || !answers) return null;

  const { graded, score, multiplier, rawPercent } = result;
  const showReview = review !== null;
  const unanswered = result.total - result.answered;
  const incorrect = [...statuses.values()].filter(
    (status) => status === "incorrect"
  ).length;
  const timeTaken = formatClock(result.timeTakenSec);

  const visible = questions
    .map((question, index) => ({ question, index }))
    .filter(
      ({ question }) => filter === "all" || statuses.get(question.id) === filter
    );

  const facts: [string, string][] = [];
  if (graded) facts.push(["Correct", `${result.correct} of ${result.total}`]);
  facts.push(["Time taken", timeTaken], ["Difficulty", capitalise(difficulty)]);
  if (unanswered > 0) facts.push(["Not answered", String(unanswered)]);
  if (tabSwitches > 0) facts.push(["Tab switches", String(tabSwitches)]);
  if (fullscreenExits > 0) {
    facts.push(["Left fullscreen", String(fullscreenExits)]);
  }

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
    <div data-theme="dark" className="flex-1 bg-bg text-text">
      <Container className="py-6 sm:py-8">
        <div className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-12">
          <Card className="p-5 sm:p-6 lg:sticky lg:top-8">
            <p className="text-label">{"// Results"}</p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 w-fit max-w-full text-3xl focus:outline-none"
            >
              {graded ? "Quiz complete" : "Answers submitted"}
            </h1>
            <p className="mt-1 text-text-muted">{quiz.title}</p>

            {graded ? (
              <p
                className="mt-6 font-mono text-6xl tabular-nums leading-none"
                data-testid="quiz-score"
              >
                {score}%
              </p>
            ) : (
              <p className="mt-6 text-text-body">
                This quiz is checked by its owner, so there&apos;s no score yet.
              </p>
            )}

            {graded && multiplier !== 1 && (
              <p className="mt-4 text-sm text-text-body">
                {capitalise(difficulty)} is worth ×{multiplier}. Your{" "}
                {rawPercent}% raw score counts as {score}%, capped at 100%.
              </p>
            )}

            {result.late && (
              <Alert variant="warning" className="mt-4">
                Your time had run out before this reached us, so only the
                answers saved before then counted.
              </Alert>
            )}

            <dl className="mt-6 divide-y divide-border border-border border-y">
              {facts.map(([term, value]) => (
                <div
                  key={term}
                  className="flex items-center justify-between gap-4 py-2.5"
                >
                  <dt className="text-sm text-text-muted">{term}</dt>
                  <dd className="font-mono text-sm tabular-nums">
                    {term === "Difficulty" ? (
                      <Badge variant="outline">{value}</Badge>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex flex-col gap-3">
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
            </div>

            {!signedIn && (
              <p className="mt-4 text-center text-sm text-text-muted">
                <Link
                  href="/sign-in"
                  className="text-link underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>{" "}
                to keep your attempts in one place.
              </p>
            )}
          </Card>

          {showReview && (
            <section aria-labelledby="review-heading" className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-x-6 border-border border-b">
                <h2 id="review-heading" className="pb-3 text-xl">
                  Review your answers
                </h2>
                <FilterTabs<ReviewFilter>
                  label="Filter questions"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "All", count: result.total },
                    { value: "incorrect", label: "Incorrect", count: incorrect },
                    {
                      value: "unanswered",
                      label: "Not answered",
                      count: unanswered,
                    },
                  ]}
                />
              </div>

              {visible.length === 0 ? (
                <p className="mt-6 text-text-muted">
                  {filter === "incorrect"
                    ? "No incorrect answers."
                    : "You answered every question."}
                </p>
              ) : (
                <ol className="mt-6 space-y-4">
                  {visible.map(({ question, index }) => (
                    <QuestionReview
                      key={question.id}
                      question={question}
                      review={review[question.id] ?? { correctIndex: null }}
                      position={index + 1}
                      answer={answers[question.id] ?? null}
                    />
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      </Container>
    </div>
  );
}
