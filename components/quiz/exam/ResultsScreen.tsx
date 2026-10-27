"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Container } from "@/components/layout/Container";
import { Alert, Card, FilterTabs } from "@/components/ui";
import { formatClock, getQuestionStatus } from "@/lib/exam/answers";
import type { ExamQuestion, SubmitResult } from "@/lib/exam/types";
import QuestionReview from "./QuestionReview";

type ReviewFilter = "all" | "incorrect" | "unanswered";

interface ResultsScreenProps {
  title: string;
  questions: ExamQuestion[];
  result: SubmitResult;
  difficulty: string;
  /** A line under the quiz title, e.g. when the attempt was taken. */
  subtitle?: string;
  /** The buttons and links under the numbers. */
  actions: ReactNode;
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Score, what it's made of, a plain note on the difficulty multiplier, and (unless the quiz owner turned
 * it off) a question-by-question review. Every number and the review itself come from the server's
 * result; the browser never knew which options were right until now. Shown right after a submit and
 * again, later, from My quizzes.
 */
export default function ResultsScreen({
  title,
  questions,
  result,
  difficulty,
  subtitle,
  actions,
}: ResultsScreenProps) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A new screen: start at the top and tell screen readers where they are.
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus();
  }, []);

  const { review, answers } = result;

  const statuses = useMemo(
    () =>
      new Map(
        questions.map((question) => [
          question.id,
          getQuestionStatus(review?.[question.id]?.correct ?? [], answers?.[question.id]),
        ])
      ),
    [questions, review, answers]
  );

  const { graded, score, multiplier, rawPercent } = result;
  const unanswered = result.total - result.answered;
  const incorrect = [...statuses.values()].filter(
    (status) => status === "incorrect"
  ).length;

  const visible = questions
    .map((question, index) => ({ question, index }))
    .filter(
      ({ question }) => filter === "all" || statuses.get(question.id) === filter
    );

  // The three numbers that matter, side by side.
  const headline: [string, string][] = [];
  if (graded) headline.push(["Correct", `${result.correct} of ${result.total}`]);
  headline.push(
    ["Time", formatClock(result.timeTakenSec)],
    ["Difficulty", capitalise(difficulty)]
  );
  // The rest, quieter. Integrity counts are what the server recorded, not what this browser counted.
  const details: [string, string][] = [];
  if (unanswered > 0) details.push(["Not answered", String(unanswered)]);
  if (result.tabSwitches > 0) {
    details.push(["Tab switches", String(result.tabSwitches)]);
  }
  if (result.blurs > 0) details.push(["Window focus lost", String(result.blurs)]);
  if (result.fullscreenExits > 0) {
    details.push(["Left fullscreen", String(result.fullscreenExits)]);
  }

  return (
    <div className="flex-1 bg-bg text-text">
      <Container className="py-6 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-10">
          <Card className="p-5 lg:sticky lg:top-8">
            <p className="text-label">{"// Results"}</p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 w-fit max-w-full text-2xl focus:outline-none"
            >
              {graded ? "Quiz complete" : "Answers submitted"}
            </h1>
            <p className="mt-1 text-text-body">{title}</p>
            {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}

            {graded ? (
              <p
                className="mt-5 font-mono text-5xl tabular-nums leading-none"
                data-testid="quiz-score"
              >
                {score}%
              </p>
            ) : (
              <p className="mt-5 text-text-body">
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

            <dl className="mt-5 grid auto-cols-fr grid-flow-col divide-x divide-border rounded-md border border-border bg-bg-alt">
              {headline.map(([term, value]) => (
                <div key={term} className="min-w-0 px-3 py-2.5">
                  <dt className="text-text-muted text-xs">{term}</dt>
                  <dd className="mt-0.5 truncate font-medium font-mono text-sm tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {details.length > 0 && (
              <dl className="mt-3 space-y-1 text-text-muted text-xs">
                {details.map(([term, value]) => (
                  <div key={term} className="flex items-center justify-between gap-4">
                    <dt>{term}</dt>
                    <dd className="font-mono tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-5 flex flex-col gap-2.5">{actions}</div>
          </Card>

          {review !== null && (
            <section aria-labelledby="review-heading" className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-x-6 border-border border-b">
                <h2 id="review-heading" className="pb-3 text-lg">
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
                <p className="mt-4 text-text-muted">
                  {filter === "incorrect"
                    ? "No incorrect answers."
                    : "You answered every question."}
                </p>
              ) : (
                <ol className="mt-4 space-y-4">
                  {visible.map(({ question, index }) => (
                    <QuestionReview
                      key={question.id}
                      question={question}
                      review={review[question.id] ?? { correct: [] }}
                      position={index + 1}
                      answer={answers[question.id] ?? []}
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
