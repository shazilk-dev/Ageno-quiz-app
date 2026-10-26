"use client";

import { FileQuestion, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Dialog,
  EmptyState,
  SearchInput,
  Skeleton,
  useToast,
} from "@/components/ui";
import { adminQuizzes } from "@/lib/admin-api";
import { ApiRequestError } from "@/lib/api-client";
import { LEVELS, LEVEL_LABELS, type AdminQuizSummary } from "@/lib/quiz-schema";

const formatDate = (ms: number) =>
  ms
    ? new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "Unknown";

const totalQuestions = (quiz: AdminQuizSummary) =>
  LEVELS.reduce((sum, level) => sum + (quiz.counts[level] ?? 0), 0);

export default function QuizzesPage() {
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState<AdminQuizSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<AdminQuizSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setQuizzes(null);
    try {
      setQuizzes(await adminQuizzes.list());
    } catch (failure) {
      setError(
        failure instanceof ApiRequestError ? failure.message : "We couldn't load the quizzes. Try again."
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !quizzes) return quizzes;
    return quizzes.filter((quiz) =>
      [quiz.title, quiz.description, quiz.accessCode].some((text) => text.toLowerCase().includes(term))
    );
  }, [quizzes, search]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const { deletedResults } = await adminQuizzes.remove(deleting.id);
      setQuizzes((current) => current?.filter((quiz) => quiz.id !== deleting.id) ?? null);
      toast({
        title: "Quiz deleted",
        description:
          deletedResults > 0
            ? `${deletedResults} ${deletedResults === 1 ? "result was" : "results were"} deleted with it.`
            : undefined,
        variant: "success",
      });
      setDeleting(null);
    } catch (failure) {
      setDeleteError(
        failure instanceof ApiRequestError ? failure.message : "We couldn't delete the quiz. Try again."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const newQuiz = (
    <Button asChild>
      <Link href="/quizzes/new">
        <Plus className="size-4" aria-hidden="true" />
        New quiz
      </Link>
    </Button>
  );

  return (
    <AdminPage
      title="Quizzes"
      description="Create, edit and delete the quizzes players can take."
      actions={newQuiz}
    >
      {error && (
        <Alert
          variant="error"
          title="Couldn't load the quizzes"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!error && quizzes === null && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading quizzes">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-24 w-full" />
          ))}
        </div>
      )}

      {quizzes && quizzes.length === 0 && (
        <EmptyState
          icon={FileQuestion}
          title="No quizzes yet"
          description="Create your first quiz and it will show up here, ready to share."
          action={newQuiz}
        />
      )}

      {quizzes && quizzes.length > 0 && (
        <>
          <SearchInput
            label="Search quizzes"
            placeholder="Search by title, description or code"
            value={search}
            onChange={setSearch}
            className="mb-6 max-w-md"
          />

          {visible && visible.length === 0 ? (
            <EmptyState
              title="No quizzes match"
              description={`Nothing matches "${search.trim()}".`}
              action={
                <Button variant="secondary" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {visible?.map((quiz) => (
                <li key={quiz.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/quizzes/${quiz.id}`}
                        className="text-lg font-medium text-text transition-fast hover:text-link"
                      >
                        {quiz.title}
                      </Link>
                      {!quiz.active && <Badge>Closed</Badge>}
                      {!quiz.isPublic && <Badge variant="outline">Not listed</Badge>}
                      {quiz.examMode === "strict" && <Badge variant="outline">Strict</Badge>}
                    </div>
                    {quiz.description && (
                      <p className="mt-1 line-clamp-1 text-sm text-text-muted">{quiz.description}</p>
                    )}
                    <p className="mt-2 font-mono text-sm text-text-muted">
                      {totalQuestions(quiz)} questions
                      {LEVELS.filter((level) => quiz.counts[level]).map((level) => (
                        <span key={level}>
                          {" · "}
                          {LEVEL_LABELS[level]} {quiz.counts[level]}
                        </span>
                      ))}
                      {" · "}
                      {quiz.responseCount} {quiz.responseCount === 1 ? "result" : "results"}
                      {" · "}
                      {formatDate(quiz.createdAt)}
                    </p>
                    {quiz.accessCode && (
                      <p className="mt-2 flex items-center gap-2 text-sm">
                        <span className="font-mono tracking-[0.1em]">{quiz.accessCode}</span>
                        <CopyButton text={quiz.accessCode} label="Copy code" />
                        <span className="text-text-muted">
                          {quiz.requiresAccessCode ? "required to start" : "optional"}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/quizzes/${quiz.id}`}>View</Link>
                    </Button>
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/quizzes/${quiz.id}/edit`}>Edit</Link>
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(quiz);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => !deleteBusy && setDeleting(null)}
        dismissible={!deleteBusy}
        title={deleting ? `Delete "${deleting.title}"?` : "Delete quiz"}
        description={
          deleting
            ? `This permanently deletes the quiz, its ${totalQuestions(deleting)} questions and the ${deleting.responseCount} ${deleting.responseCount === 1 ? "result" : "results"} people earned on it. It can't be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Keep quiz
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleteBusy}>
              Delete quiz
            </Button>
          </>
        }
      >
        {deleteError && <Alert variant="error">{deleteError}</Alert>}
      </Dialog>
    </AdminPage>
  );
}
