"use client";

import { BarChart3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, FilterTabs, Select, Skeleton } from "@/components/ui";
import { adminQuizzes } from "@/lib/admin-api";
import { ApiRequestError } from "@/lib/api-client";
import {
  FLAG_LABELS,
  MIN_FOR_FLAGS,
  type LevelInsight,
  type QuestionInsight,
  type QuizInsights,
} from "@/lib/item-analysis";
import { LEVEL_LABELS, type Level } from "@/lib/quiz-schema";
import { cn } from "@/lib/utils";

type Show = "all" | "flagged";
type Order = "quiz" | "hardest" | "easiest";

const percent = (share: number | null) => (share === null ? "—" : `${Math.round(share * 100)}%`);

const signed = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;

const levelLabel = (level: string) => LEVEL_LABELS[level as Level] ?? level;

function orderOf(questions: QuestionInsight[], order: Order): QuestionInsight[] {
  if (order === "quiz") return questions;
  const sign = order === "hardest" ? 1 : -1;
  // Questions without a key can't be ranked; they go last.
  return [...questions].sort(
    (a, b) => sign * ((a.difficulty ?? 2 * sign) - (b.difficulty ?? 2 * sign))
  );
}

function OptionBars({ question }: { question: QuestionInsight }) {
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {question.options.map((option) => (
        <li key={option.index}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="font-mono text-text-muted">{String.fromCharCode(65 + option.index)}.</span>{" "}
              {option.text}
              {option.correct && (
                <span className="ml-2 font-mono text-link text-xs uppercase tracking-[0.05em]">Correct</span>
              )}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-text-muted">
              {option.picks} · {percent(option.rate)}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-alt" aria-hidden="true">
            <div
              className={cn("h-full rounded-full", option.correct ? "bg-success" : "bg-border-strong")}
              style={{ width: `${Math.round(option.rate * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function QuestionRow({ question }: { question: QuestionInsight }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-[0.05em] text-text-muted">
            Question {question.position}
            {question.type === "multiple" && " · Select all"}
          </p>
          <p className="mt-1 font-medium [overflow-wrap:anywhere]">{question.label || "(no text)"}</p>
        </div>
        <dl className="flex shrink-0 gap-6 text-sm">
          <div>
            <dt className="text-text-muted text-xs">Got it right</dt>
            <dd className="font-mono text-lg tabular-nums">
              {question.correct === null ? "No key" : percent(question.difficulty)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted text-xs">Separates strong from weak</dt>
            <dd className="font-mono text-lg tabular-nums">{signed(question.discrimination)}</dd>
          </div>
        </dl>
      </div>

      {question.flags.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {question.flags.map((flag) => (
            <li key={flag} className="flex flex-wrap items-baseline gap-2 text-sm text-text-body">
              <Badge variant="outline">{FLAG_LABELS[flag].label}</Badge>
              <span>{FLAG_LABELS[flag].hint}</span>
            </li>
          ))}
        </ul>
      )}
      {!question.enough && (
        <p className="mt-3 text-sm text-text-muted">
          Only {question.attempts} {question.attempts === 1 ? "result" : "results"} so far. Nothing is flagged
          until there are {MIN_FOR_FLAGS}.
        </p>
      )}

      <details className="group mt-3">
        <summary className="min-h-10 cursor-pointer list-none py-2 font-medium text-sm text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
          Which options people picked
        </summary>
        <OptionBars question={question} />
      </details>
    </li>
  );
}

function LevelSection({ level, show, order }: { level: LevelInsight; show: Show; order: Order }) {
  const questions = useMemo(
    () => orderOf(level.questions, order).filter((q) => show === "all" || q.flags.length > 0),
    [level, show, order]
  );
  const headingId = `insight-${level.level}`;
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="text-xl">
        {levelLabel(level.level)}
      </h2>
      <p className="mt-1 font-mono text-sm text-text-muted">
        {level.attempts} {level.attempts === 1 ? "result" : "results"} · {level.questions.length}{" "}
        {level.questions.length === 1 ? "question" : "questions"}
      </p>
      {level.attempts === 0 ? (
        <p className="mt-4 text-text-muted">No one has finished this level yet.</p>
      ) : questions.length === 0 ? (
        <p className="mt-4 text-text-muted">No question here needs attention.</p>
      ) : (
        <Card className="mt-4 overflow-hidden">
          <ol className="divide-y divide-border">
            {questions.map((question) => (
              <QuestionRow key={question.id} question={question} />
            ))}
          </ol>
        </Card>
      )}
    </section>
  );
}

/**
 * How each question of a quiz performed: the share who got it right, how well it separates strong results from
 * weak ones, and how often each option was picked, with plain flags for what to look at. The figures cover the
 * latest finished results and are cached for a few minutes on the server.
 */
export function QuizInsightsPanel({ quizId }: { quizId: string }) {
  const [data, setData] = useState<QuizInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [order, setOrder] = useState<Order>("quiz");

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminQuizzes.insights(quizId));
    } catch (failure) {
      setError(
        failure instanceof ApiRequestError
          ? failure.message
          : "We couldn't load the results by question. Try again."
      );
    }
  }, [quizId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Alert
        variant="error"
        title="Couldn't load the results by question"
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading results by question">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }
  if (data.analysed === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No results yet"
        description="Once people finish this quiz, you will see here which questions are too hard, too easy or may have the wrong answer marked."
      />
    );
  }

  return (
    <div>
      <p className="text-text-body" data-testid="insights-basis">
        {data.analysed < data.total
          ? `Based on the latest ${data.analysed} of ${data.total} results.`
          : `Based on all ${data.analysed} ${data.analysed === 1 ? "result" : "results"}.`}{" "}
        These figures are a guide to what to look at, not a verdict. They can lag by a few minutes.
      </p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-border border-b">
        <FilterTabs<Show>
          label="Show questions"
          value={show}
          onChange={setShow}
          options={[
            { value: "all", label: "All" },
            { value: "flagged", label: "Needs attention", count: data.flagged },
          ]}
        />
        <div className="pb-2">
          <Select label="Order" value={order} onChange={(event) => setOrder(event.target.value as Order)}>
            <option value="quiz">Quiz order</option>
            <option value="hardest">Hardest first</option>
            <option value="easiest">Easiest first</option>
          </Select>
        </div>
      </div>

      {data.levels.map((level) => (
        <LevelSection key={level.level} level={level} show={show} order={order} />
      ))}
    </div>
  );
}
