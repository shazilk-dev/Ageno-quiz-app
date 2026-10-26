"use client";

import React, { useCallback, useEffect, useState } from "react";
import { FiUsers, FiFileText, FiCheckCircle, FiClock } from "react-icons/fi";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QuizScoreDistribution from "@/components/analytics/QuizScoreDistribution";
import QuizTimeDistribution from "@/components/analytics/QuizTimeDistribution";
import { Alert, Button, Dialog, useToast } from "@/components/ui";
import { adminQuizzes, adminReports } from "@/lib/admin-api";
import { toQuizResponse, type DashboardData } from "@/lib/admin-types";
import { ApiRequestError } from "@/lib/api-client";

const formatDate = (timestamp: number | null | undefined): string =>
  timestamp
    ? new Date(timestamp).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Unknown";

export default function Dashboard() {
  const router = useRouter();
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
      await adminQuizzes.remove(deleting.id);
      toast({ title: "Quiz deleted", variant: "success" });
      setDeleting(null);
      await load();
    } catch (failure) {
      setDeleteError(
        failure instanceof ApiRequestError
          ? failure.message
          : "We couldn't delete the quiz. Try again."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const isLoading = data === null && error === null;
  const stats = {
    totalUsers: data?.totals.users ?? 0,
    totalQuizzes: data?.totals.quizzes ?? 0,
    totalAttempts: data?.totals.attempts ?? 0,
    avgScore: data?.totals.averageScore ?? 0,
  };
  const recentQuizzes = data?.recentQuizzes ?? [];
  const chartResponses = (data?.recent ?? []).map(toQuizResponse);
  const recentAttempts = chartResponses.slice(0, 5);

  if (error && !data) {
    return (
      <div className="p-6">
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
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin h-12 w-12 border-4 border-purple-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">Overview of your quiz application</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-indigo-100 text-indigo-600 mr-4">
              <FiUsers size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalUsers}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
              <FiFileText size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Total Quizzes</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalQuizzes}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-100 text-purple-600 mr-4">
              <FiCheckCircle size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Quiz Attempts</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalAttempts}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-600 mr-4">
              <FiClock size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Avg. Score</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.avgScore}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Quizzes */}
        <div className="bg-white rounded-lg shadow">
          {" "}
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-medium">Recent Quizzes</h2>
            <Link
              href="/quizzes"
              className="text-sm text-purple-600 hover:text-purple-800"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {recentQuizzes.length > 0 ? (
              recentQuizzes.map((quiz) => (
                <div
                  key={quiz.id}
                  className="p-4 flex justify-between items-center"
                >
                  <div>
                    <h3 className="font-medium text-gray-900">{quiz.title}</h3>
                    <p className="text-sm text-gray-500">
                      Created: {formatDate(quiz.createdAt)}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    {" "}
                    <button
                      onClick={() =>
                        router.push(`/quizzes/${quiz.id}/edit`)
                      }
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting({ id: quiz.id, title: quiz.title });
                      }}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-gray-500">
                No quizzes yet.{" "}
                <Link
                  href="/quizzes/new"
                  className="text-purple-600 hover:text-purple-800"
                >
                  Create one
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Attempts */}
        <div className="bg-white rounded-lg shadow">
          {" "}
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-medium">Recent Quiz Attempts</h2>
            <Link
              href="/quiz-reports"
              className="text-sm text-purple-600 hover:text-purple-800"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {recentAttempts.length > 0 ? (
              recentAttempts.map((attempt) => (
                <div key={attempt.id} className="p-4">
                  <div className="flex justify-between">
                    <h3 className="font-medium text-gray-900">
                      {attempt.quizTitle}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        attempt.score !== undefined && attempt.score !== null
                          ? attempt.score >= 70
                            ? "bg-green-100 text-green-800"
                            : attempt.score >= 40
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {attempt.score !== undefined && attempt.score !== null
                        ? `${attempt.score}%`
                        : "No score"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    By {attempt.userName} • {formatDate(attempt.submittedAt as number | undefined)}
                  </p>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-gray-500">
                No quiz attempts yet.
              </div>
            )}
          </div>{" "}
        </div>
      </div>
      {/* Performance Analytics */}
      {chartResponses.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Performance Analytics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-4">
              <QuizScoreDistribution
                responses={chartResponses}
                title="Score Distribution Overview"
              />
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <QuizTimeDistribution responses={chartResponses} />
            </div>
          </div>
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
    </div>
  );
}
