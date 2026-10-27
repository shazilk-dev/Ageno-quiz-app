"use client";

import { Copy, Download, Pencil } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { Alert, Badge, Button, CopyButton, Skeleton } from "@/components/ui";
import { useDuplicateQuiz } from "@/hooks/useDuplicateQuiz";
import { adminQuizzes } from "@/lib/admin-api";
import { ApiRequestError } from "@/lib/api-client";
import { downloadText, fileSlug } from "@/lib/download";
import { exportCsv, exportJson, exportText } from "@/lib/quiz-format/write";
import { LEVELS, LEVEL_LABELS, type AdminQuizDetail } from "@/lib/quiz-schema";

const BACK = { href: "/quizzes", label: "All quizzes" };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-[0.05em] text-text-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

/** A read-only look at a quiz as players will meet it, with the correct answers marked. */
export default function ViewQuizPage() {
  const { quizId } = useParams() as { quizId: string };
  const [quiz, setQuiz] = useState<AdminQuizDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { duplicate, busyId } = useDuplicateQuiz();

  const load = useCallback(async () => {
    setError(null);
    try {
      setQuiz(await adminQuizzes.get(quizId));
    } catch (failure) {
      setError(
        failure instanceof ApiRequestError && failure.status === 404
          ? "That quiz doesn't exist. It may have been deleted."
          : failure instanceof ApiRequestError
            ? failure.message
            : "We couldn't load this quiz. Try again."
      );
    }
  }, [quizId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <AdminPage title="Quiz" back={BACK}>
        <Alert
          variant="error"
          title="Couldn't open this quiz"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      </AdminPage>
    );
  }

  if (!quiz) {
    return (
      <AdminPage title="Quiz" back={BACK}>
        <div className="space-y-4" aria-busy="true" aria-label="Loading quiz">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminPage>
    );
  }

  const levels = LEVELS.filter((level) => quiz.levels[level]);
  const totalQuestions = levels.reduce((sum, level) => sum + (quiz.levels[level]?.questions.length ?? 0), 0);

  return (
    <AdminPage
      title={quiz.title || "Untitled quiz"}
      description={quiz.description || undefined}
      back={BACK}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => downloadText(`${fileSlug(quiz.title)}.ageno.json`, exportJson(quiz), "application/json")}>
            <Download className="size-4" aria-hidden="true" />
            Export JSON
          </Button>
          <Button variant="ghost" onClick={() => downloadText(`${fileSlug(quiz.title)}.csv`, exportCsv(quiz), "text/csv")}>
            Export CSV
          </Button>
          <Button variant="ghost" onClick={() => downloadText(`${fileSlug(quiz.title)}.txt`, exportText(quiz))}>
            Export text
          </Button>
          <Button variant="secondary" onClick={() => void duplicate(quiz.id)} loading={busyId === quiz.id}>
            <Copy className="size-4" aria-hidden="true" />
            Duplicate
          </Button>
          <Button asChild>
            <Link href={`/quizzes/${quiz.id}/edit`}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit quiz
            </Link>
          </Button>
        </div>
      }
    >
      <dl className="grid gap-6 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Access code">
          <span className="inline-flex items-center gap-2">
            <span className="font-mono tracking-[0.1em]">{quiz.accessCode || "None"}</span>
            {quiz.accessCode && <CopyButton text={quiz.accessCode} label="Copy code" />}
          </span>
          <span className="block text-sm text-text-muted">
            {quiz.requiresAccessCode ? "Required to start" : "Not required to start"}
          </span>
        </Fact>
        <Fact label="Time limit">{quiz.duration} min by default</Fact>
        <Fact label="Questions">
          {totalQuestions} across {levels.length} {levels.length === 1 ? "level" : "levels"}
        </Fact>
        <Fact label="Results">{quiz.responseCount}</Fact>
        <Fact label="Marking">{quiz.isAutoCheck ? "Automatic" : "Not marked"}</Fact>
        <Fact label="Answer review">{quiz.showAnswerReview ? "Shown after submitting" : "Hidden"}</Fact>
        <Fact label="Exam mode">{quiz.examMode === "strict" ? "Strict" : "Practice"}</Fact>
        <Fact label="Status">
          <span className="flex flex-wrap gap-2">
            <Badge variant={quiz.active ? "teal" : "default"}>{quiz.active ? "Open" : "Closed"}</Badge>
            <Badge variant="outline">{quiz.isPublic ? "Listed" : "Not listed"}</Badge>
          </span>
        </Fact>
      </dl>

      {levels.length === 0 && (
        <Alert variant="warning" title="No questions yet" className="mt-8">
          Players can&apos;t take this quiz until it has questions.
        </Alert>
      )}

      {levels.map((level) => {
        const entry = quiz.levels[level]!;
        return (
          <section key={level} aria-labelledby={`level-${level}`} className="mt-10">
            <h2 id={`level-${level}`} className="text-xl">
              {LEVEL_LABELS[level]}
            </h2>
            <p className="mt-1 font-mono text-sm text-text-muted">
              {entry.questions.length} {entry.questions.length === 1 ? "question" : "questions"} ·{" "}
              {entry.duration} min · ×{entry.pointsMultiplier}
            </p>
            <ol className="mt-4 space-y-4">
              {entry.questions.map((question, index) => (
                <li key={question.id ?? index} className="rounded-lg border border-border bg-surface p-5">
                  <p className="font-mono text-xs uppercase tracking-[0.05em] text-text-muted">
                    Question {index + 1}
                    {question.type === "multiple" && " · Select all that apply"}
                  </p>
                  <p className="mt-2 font-medium">{question.text}</p>
                  <ul className="mt-3 space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <li
                        key={optionIndex}
                        className={
                          option.isCorrect
                            ? "rounded-md border border-accent px-3 py-2"
                            : "rounded-md border border-border px-3 py-2 text-text-body"
                        }
                      >
                        {option.text}
                        {option.isCorrect && (
                          <span className="ml-2 font-mono text-xs uppercase tracking-[0.05em] text-link">
                            Correct
                          </span>
                        )}
                        {option.rationale && (
                          <p className="mt-1 whitespace-pre-line text-sm text-text-muted">{option.rationale}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {question.explanation && (
                    <p className="mt-3 text-sm text-text-muted">Explanation: {question.explanation}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </AdminPage>
  );
}
