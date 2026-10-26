"use client";

import { ClipboardList, Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { DistributionChart } from "@/components/admin/DistributionChart";
import { ReportsTable } from "@/components/admin/ReportsTable";
import { Alert, Button, EmptyState, Select, Skeleton, StatStrip } from "@/components/ui";
import { adminReports } from "@/lib/admin-api";
import {
  formatDuration,
  scoreBands,
  summarizeReports,
  timeBands,
  toCsv,
} from "@/lib/admin-analytics";
import type { ReportRow } from "@/lib/admin-types";
import { ApiRequestError } from "@/lib/api-client";

type Period = "all" | "week" | "month";
type Order = "desc" | "asc";

const describeError = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : "We couldn't load the reports. Try again.";

const percent = (value: number | null) => (value === null ? "—" : `${value}%`);

export default function QuizReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [quizzes, setQuizzes] = useState<{ id: string; title: string }[]>([]);
  const [quizId, setQuizId] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [order, setOrder] = useState<Order>("desc");
  // Results come a page at a time, newest first. `cursor` is where the next (older) page starts.
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One request for a page of results: the server looks up quiz titles and names in a single batch.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await adminReports.page({ quizId: quizId || undefined });
      setRows(page.rows);
      setQuizzes(page.quizzes);
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch (failure) {
      // If the quiz filter can't be served yet, fall back to every quiz and say so.
      if (failure instanceof ApiRequestError && failure.code === "index_required") setQuizId("");
      setError(describeError(failure));
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await adminReports.page({ cursor, quizId: quizId || undefined });
      setRows((current) => [...current, ...page.rows]);
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setLoadingMore(false);
    }
  };

  // The period filters what is already loaded; the quiz filter is on the server.
  const visible = useMemo(() => {
    let list = rows;
    if (period !== "all") {
      const since = new Date();
      if (period === "week") since.setDate(since.getDate() - 7);
      else since.setMonth(since.getMonth() - 1);
      list = list.filter((row) => (row.submittedAt ?? 0) >= since.getTime());
    }
    return [...list].sort((a, b) =>
      order === "asc"
        ? (a.submittedAt ?? 0) - (b.submittedAt ?? 0)
        : (b.submittedAt ?? 0) - (a.submittedAt ?? 0)
    );
  }, [rows, period, order]);

  const summary = useMemo(() => summarizeReports(visible), [visible]);
  const bands = useMemo(() => ({ score: scoreBands(visible), time: timeBands(visible) }), [visible]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(visible)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "quiz-reports.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const filtered = quizId !== "" || period !== "all";
  const clearFilters = () => {
    setQuizId("");
    setPeriod("all");
  };

  return (
    <AdminPage
      title="Reports"
      description="Every finished quiz, with scores, timing and what was recorded during the attempt."
      actions={
        <Button variant="secondary" onClick={exportCsv} disabled={visible.length === 0}>
          <Download className="size-4" aria-hidden="true" />
          Export CSV
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Quiz" value={quizId} onChange={(event) => setQuizId(event.target.value)}>
          <option value="">All quizzes</option>
          {quizzes.map((quiz) => (
            <option key={quiz.id} value={quiz.id}>
              {quiz.title}
            </option>
          ))}
        </Select>
        <Select label="Period" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
          <option value="all">All time</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
        </Select>
        <Select label="Order" value={order} onChange={(event) => setOrder(event.target.value as Order)}>
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </Select>
      </div>

      <div className="mt-6 space-y-6">
        {error && (
          <Alert
            variant="error"
            title="Couldn't load the reports"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void (cursor && !loading ? loadMore() : load())}
              >
                Try again
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading reports">
            <Skeleton className="h-[5.5rem] w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ) : visible.length === 0 ? (
          error ? null : (
            <EmptyState
              icon={ClipboardList}
              title={filtered ? "No results match these filters" : "No results yet"}
              description={
                filtered
                  ? "Try a wider period, or look at every quiz."
                  : "Finished quizzes show up here."
              }
              action={
                filtered ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <>
            <StatStrip
              stats={[
                { label: "Results", value: String(summary.attempts) },
                { label: "Average score", value: percent(summary.average) },
                { label: "Highest", value: percent(summary.highest) },
                { label: "Lowest", value: percent(summary.lowest) },
                { label: "Average time", value: formatDuration(summary.averageSeconds) },
              ]}
            />

            {cursor && (
              <p className="text-sm text-text-muted">
                The numbers and charts cover the {rows.length} most recent of {total} results. Load older
                results below to include them.
              </p>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <DistributionChart as="h2" title="Scores" bands={bands.score} />
              <DistributionChart as="h2" title="Time taken" bands={bands.time} />
            </div>

            <ReportsTable rows={visible} />

            {cursor && (
              <div className="text-center">
                <p className="mb-3 text-sm text-text-muted">
                  Showing {rows.length} of {total} results
                </p>
                <Button variant="secondary" onClick={() => void loadMore()} loading={loadingMore}>
                  Load older results
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminPage>
  );
}
