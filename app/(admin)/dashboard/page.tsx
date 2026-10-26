"use client";

import { FileQuestion, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { DistributionChart } from "@/components/admin/DistributionChart";
import {
  Alert,
  Button,
  Card,
  Dialog,
  EmptyState,
  Skeleton,
  StatStrip,
  useToast,
} from "@/components/ui";
import { adminQuizzes, adminReports } from "@/lib/admin-api";
import { scoreBands, timeBands } from "@/lib/admin-analytics";
import type { DashboardData } from "@/lib/admin-types";
import { ApiRequestError } from "@/lib/api-client";

const formatDate = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "Unknown";

function PanelHeader({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-border border-b px-5 py-4">
      <h2 className="text-lg">{title}</h2>
      <Link href={href} className="text-sm text-link underline-offset-4 hover:underline">
        {label}
      </Link>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the dashboard">
      <Skeleton className="h-[5.5rem] w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The numbers come from counts and small queries on the server, not from reading whole collections.
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminReports.dashboard());
    } catch (failure) {
      setError(
        failure instanceof ApiRequestError
          ? failure.message
          : "We couldn't load the dashboard. Try again."
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDeleteQuiz = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const { deletedResults } = await adminQuizzes.remove(deleting.id);
      toast({
        title: "Quiz deleted",
        description:
          deletedResults > 0
            ? `${deletedResults} ${deletedResults === 1 ? "result was" : "results were"} deleted with it.`
            : undefined,
        variant: "success",
      });
      setDeleting(null);
      await load();
    } catch (failure) {
      setDeleteError(
        failure instanceof ApiRequestError ? failure.message : "We couldn't delete the quiz. Try again."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const recent = useMemo(() => data?.recent ?? [], [data]);
  const bands = useMemo(() => ({ score: scoreBands(recent), time: timeBands(recent) }), [recent]);

  return (
    <AdminPage
      title="Dashboard"
      description="How the quizzes are doing."
      actions={
        <Button asChild>
          <Link href="/quizzes/new">
            <Plus className="size-4" aria-hidden="true" />
            New quiz
          </Link>
        </Button>
      }
    >
      {error && !data ? (
        <Alert
          variant="error"
          title="Couldn't load the dashboard"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-8">
          <StatStrip
            stats={[
              { label: "Users", value: String(data.totals.users) },
              { label: "Quizzes", value: String(data.totals.quizzes) },
              { label: "Results", value: String(data.totals.attempts) },
              { label: "Average score", value: data.totals.attempts ? `${data.totals.averageScore}%` : "—" },
            ]}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <PanelHeader title="Recent quizzes" href="/quizzes" label="All quizzes" />
              {data.recentQuizzes.length > 0 ? (
                <ul className="divide-y divide-border">
                  {data.recentQuizzes.map((quiz) => (
                    <li key={quiz.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`/quizzes/${quiz.id}`}
                          className="block truncate font-medium transition-fast hover:text-link"
                        >
                          {quiz.title}
                        </Link>
                        <p className="font-mono text-sm text-text-muted">{formatDate(quiz.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button asChild variant="secondary" size="sm">
                          <Link href={`/quizzes/${quiz.id}/edit`}>Edit</Link>
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting({ id: quiz.id, title: quiz.title });
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  className="m-5"
                  icon={FileQuestion}
                  title="No quizzes yet"
                  description="Create one and it shows up here."
                  action={
                    <Button asChild>
                      <Link href="/quizzes/new">New quiz</Link>
                    </Button>
                  }
                />
              )}
            </Card>

            <Card>
              <PanelHeader title="Recent results" href="/quiz-reports" label="All reports" />
              {recent.length > 0 ? (
                <ul className="divide-y divide-border">
                  {recent.slice(0, 5).map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.quizTitle}</p>
                        <p className="truncate text-sm text-text-muted">
                          {row.userName} · {formatDate(row.submittedAt)}
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-lg tabular-nums">
                        {row.score === null ? <span className="text-sm text-text-muted">Not scored</span> : `${row.score}%`}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-8 text-text-muted">No one has finished a quiz yet.</p>
              )}
            </Card>
          </div>

          {recent.length > 0 && (
            <section aria-labelledby="spread-heading">
              <h2 id="spread-heading" className="text-xl">
                Score and time spread
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                From the latest {recent.length} {recent.length === 1 ? "result" : "results"}.
              </p>
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <DistributionChart title="Scores" bands={bands.score} />
                <DistributionChart title="Time taken" bands={bands.time} />
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => !deleteBusy && setDeleting(null)}
        dismissible={!deleteBusy}
        title={deleting ? `Delete "${deleting.title}"?` : "Delete quiz"}
        description="This permanently deletes the quiz, its questions and the results people earned on it. It can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Keep quiz
            </Button>
            <Button variant="danger" onClick={confirmDeleteQuiz} loading={deleteBusy}>
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
