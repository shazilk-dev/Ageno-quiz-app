"use client";

import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import QuestionReview from "@/components/quiz/exam/QuestionReview";
import { Alert, Badge, Button, Card, EmptyState, FilterTabs, Skeleton } from "@/components/ui";
import { adminReports } from "@/lib/admin-api";
import type { AdminAttemptDetail, AttemptEventDTO } from "@/lib/admin-types";
import { ApiRequestError } from "@/lib/api-client";
import { formatClock, getQuestionStatus } from "@/lib/exam/answers";

type ReviewFilter = "all" | "incorrect" | "unanswered";

const BACK = { href: "/quiz-reports", label: "All results" };

const EVENT_LABELS: Record<AttemptEventDTO["type"], string> = {
  tab_hidden: "Switched to another tab or minimised the window",
  window_blur: "The window lost focus",
  fullscreen_exit: "Left fullscreen",
};

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: AdminAttemptDetail }
  | { kind: "missing"; message: string }
  | { kind: "unfinished" }
  | { kind: "failed"; message: string };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-xs uppercase tracking-[0.05em] text-text-muted">{label}</dt>
      <dd className="mt-1 truncate">{children}</dd>
    </div>
  );
}

/**
 * One finished attempt, for an admin: who took it, the score, every question with what they picked next to
 * the key and reasons, and what the browser recorded while they took it. `initial` is what the server found
 * when it rendered the page; without it the browser asks.
 */
export default function AttemptDetailClient({
  attemptId,
  initial = null,
}: {
  attemptId: string;
  initial?: AdminAttemptDetail | null;
}) {
  const [state, setState] = useState<State>(
    initial ? { kind: "ready", data: initial } : { kind: "loading" }
  );
  const [filter, setFilter] = useState<ReviewFilter>("all");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", data: await adminReports.attempt(attemptId) });
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.code === "attempt_not_found") {
        setState({ kind: "missing", message: failure.message });
      } else if (failure instanceof ApiRequestError && failure.code === "attempt_not_finished") {
        setState({ kind: "unfinished" });
      } else {
        setState({
          kind: "failed",
          message:
            failure instanceof ApiRequestError
              ? failure.message
              : "Check your connection and try again.",
        });
      }
    }
  }, [attemptId]);

  const hadInitial = useRef(initial !== null);
  useEffect(() => {
    if (!hadInitial.current) void load();
  }, [load]);

  const data = state.kind === "ready" ? state.data : null;

  const statuses = useMemo(
    () =>
      new Map(
        (data?.questions ?? []).map((question) => [
          question.id,
          getQuestionStatus(
            data?.result.review?.[question.id]?.correct ?? [],
            data?.result.answers?.[question.id]
          ),
        ])
      ),
    [data]
  );

  if (!data) {
    return (
      <AdminPage title="Result" back={BACK}>
        {state.kind === "loading" ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading result">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : state.kind === "failed" ? (
          <Alert
            variant="error"
            title="Couldn't open this result"
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Try again
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
                : "We can't show the answers for this result"
            }
            description={
              state.kind === "unfinished"
                ? "Answers appear here once the person has submitted."
                : state.kind === "missing"
                  ? state.message
                  : undefined
            }
            action={
              <Button asChild variant="secondary">
                <Link href="/quiz-reports">Back to results</Link>
              </Button>
            }
          />
        )}
      </AdminPage>
    );
  }

  const { result, questions, events } = data;
  const review = result.review;
  const unanswered = result.total - result.answered;
  const incorrect = [...statuses.values()].filter((status) => status === "incorrect").length;

  const visible = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => filter === "all" || statuses.get(question.id) === filter);

  const options: { value: ReviewFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: result.total },
    ...(data.graded ? [{ value: "incorrect" as const, label: "Wrong", count: incorrect }] : []),
    { value: "unanswered", label: "Not answered", count: unanswered },
  ];

  return (
    <AdminPage
      title={data.player.name}
      description={data.player.email && data.player.email !== data.player.name ? data.player.email : undefined}
      back={BACK}
    >
      <Card className="p-5">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Quiz">{data.quizTitle}</Fact>
          <Fact label="Level">
            <Badge variant="outline">{capitalise(data.difficulty)}</Badge>
          </Fact>
          <Fact label="Submitted">{when(data.submittedAt)}</Fact>
          <Fact label="Time taken">
            <span className="font-mono">{formatClock(result.timeTakenSec)}</span>
          </Fact>
          <Fact label="Score">
            {data.graded ? (
              <span className="font-mono text-2xl tabular-nums" data-testid="attempt-score">
                {result.score}%
              </span>
            ) : (
              <span className="text-text-muted">Not scored</span>
            )}
          </Fact>
          {data.graded && (
            <Fact label="Correct">
              <span className="font-mono tabular-nums">
                {result.correct} of {result.total}
              </span>
            </Fact>
          )}
          <Fact label="Not answered">
            <span className="font-mono tabular-nums">{unanswered}</span>
          </Fact>
        </dl>

        {data.graded && result.multiplier !== 1 && (
          <p className="mt-4 text-sm text-text-body">
            {capitalise(data.difficulty)} is worth ×{result.multiplier}: {result.rawPercent}% raw
            counts as {result.score}%, capped at 100%.
          </p>
        )}
        {result.late && (
          <Alert variant="warning" className="mt-4">
            This was submitted after the time ran out, so only the answers saved before then counted.
          </Alert>
        )}
        {!data.graded && (
          <Alert variant="info" className="mt-4">
            This quiz isn&apos;t marked automatically. The answers are shown for you to check, and the
            marks follow the answer key where the quiz has one.
          </Alert>
        )}
      </Card>

      {review !== null && (
        <section aria-labelledby="answers-heading" className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-x-6 border-border border-b">
            <h2 id="answers-heading" className="pb-3 text-xl">
              Answers
            </h2>
            <FilterTabs<ReviewFilter>
              label="Filter questions"
              value={filter}
              onChange={setFilter}
              options={options}
            />
          </div>

          {visible.length === 0 ? (
            <p className="mt-4 text-text-muted">
              {filter === "incorrect" ? "No wrong answers." : "Every question was answered."}
            </p>
          ) : (
            <ol className="mt-4 space-y-4">
              {visible.map(({ question, index }) => (
                <QuestionReview
                  key={question.id}
                  question={question}
                  review={review[question.id] ?? { correct: [] }}
                  position={index + 1}
                  answer={result.answers[question.id] ?? []}
                  viewer="admin"
                />
              ))}
            </ol>
          )}
        </section>
      )}

      <section aria-labelledby="timeline-heading" className="mt-10">
        <h2 id="timeline-heading" className="border-border border-b pb-3 text-xl">
          Recorded during the attempt
        </h2>
        {events.length === 0 ? (
          <p className="mt-4 text-text-muted">
            {result.tabSwitches + result.blurs + result.fullscreenExits > 0
              ? "The counts are recorded, but this attempt has no timeline."
              : "Nothing was recorded: no tab switches, lost focus or fullscreen exits."}
          </p>
        ) : (
          <Card className="mt-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Events recorded while the attempt ran</caption>
                <thead className="border-border border-b">
                  <tr>
                    <th scope="col" className="text-label px-5 py-3 text-left">
                      Time into the attempt
                    </th>
                    <th scope="col" className="text-label px-3 py-3 text-left">
                      What happened
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.map((event, index) => (
                    <tr key={index}>
                      <td className="px-5 py-3 font-mono tabular-nums text-text-muted">
                        {formatClock(Math.max(0, (event.at - data.startedAt) / 1000))}
                      </td>
                      <td className="px-3 py-3">{EVENT_LABELS[event.type]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {data.eventsTruncated && (
          <p className="mt-3 text-sm text-text-muted">
            More events happened than are kept; the totals in the results table are complete.
          </p>
        )}
      </section>
    </AdminPage>
  );
}
