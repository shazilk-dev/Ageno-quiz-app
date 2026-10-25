"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { fetchMyAttempts, type MyAttempt } from "@/lib/quizzes-api";
import { formatDistanceToNow, format } from "date-fns";

export default function MyQuizzes() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [attempts, setAttempts] = useState<MyAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [indexCreated, setIndexCreated] = useState(false);
  const [stats, setStats] = useState({
    totalAttempts: 0,
    averageScore: 0,
    highestScore: 0,
    mostRecentAttempt: null as Date | null,
  });

  const fetchAttempts = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      setError(null);

      const userAttempts = await fetchMyAttempts();
      setAttempts(userAttempts);

      // Calculate stats
      if (userAttempts.length > 0) {
        const scores = userAttempts
          .map((a) => a.score || 0)
          .filter((score) => score > 0);
        const totalAttempts = userAttempts.length;
        const averageScore =
          scores.length > 0
            ? Math.round(
                scores.reduce((sum, score) => sum + score, 0) / scores.length
              )
            : 0;
        const highestScore = scores.length > 0 ? Math.max(...scores) : 0;

        // Find most recent attempt date
        const dates = userAttempts.map((a) => a.submittedAt);
        const mostRecentAttempt =
          dates.length > 0
            ? new Date(Math.max(...dates.map((d) => d.getTime())))
            : null;

        setStats({
          totalAttempts,
          averageScore,
          highestScore,
          mostRecentAttempt,
        });
      }
    } catch (err) {
      console.error("Error fetching quiz attempts:", err);

      // Check for the specific Firestore index error
      if (
        err instanceof Error &&
        err.toString().includes("The query requires an index")
      ) {
        const indexUrl =
          err
            .toString()
            .match(/https:\/\/console\.firebase\.google\.com\S+/)?.[0] || "";
        setError(
          `This page requires a Firestore index to be created. Please visit the Firebase console and create the index: ${indexUrl}`
        );
        setIndexCreated(false);
      } else {
        setError("Failed to load your quiz attempts. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchAttempts();
    }
  }, [user, retryCount, fetchAttempts]);

  if (loading || (!user && !error)) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin h-12 w-12 border-4 border-purple-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">My Quizzes</h1>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-600">
            Total Attempts
          </h3>
          <p className="text-2xl font-bold text-purple-600">
            {stats.totalAttempts}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-600">Average Score</h3>
          <p className="text-2xl font-bold text-purple-600">
            {stats.averageScore}%
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-600">Highest Score</h3>
          <p className="text-2xl font-bold text-purple-600">
            {stats.highestScore}%
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-600">Last Attempt</h3>
          <p className="text-2xl font-bold text-purple-600">
            {stats.mostRecentAttempt
              ? formatDistanceToNow(stats.mostRecentAttempt, {
                  addSuffix: true,
                })
              : "N/A"}
          </p>
        </div>
      </div>

      {/* Quiz Attempts List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4">Your Quiz Attempts</h2>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-pulse">Loading your quiz attempts...</div>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            {!indexCreated && (
              <div className="mb-4">
                <p className="text-gray-700 mb-4">
                  This requires a one-time setup in your Firebase project.
                  Please follow these steps:
                </p>
                <ol className="list-decimal list-inside text-left max-w-lg mx-auto mb-6 text-gray-800">
                  <li className="mb-2">
                    Visit the Firebase console link in your browser&apos;s
                    console (press F12 and check the console)
                  </li>
                  <li className="mb-2">
                    Click &quot;Create index&quot; on the Firebase page
                  </li>
                  <li className="mb-2">
                    Wait for the index to finish building (this may take a few
                    minutes)
                  </li>
                  <li className="mb-2">
                    Return to this page and click &quot;Refresh Data&quot; below
                  </li>
                </ol>
              </div>
            )}
            <button
              onClick={() => {
                setRetryCount((count) => count + 1);
                setIndexCreated(true);
              }}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Refresh Data
            </button>
            <p className="text-gray-500 text-sm mt-4">
              If the issue persists after creating the index, please contact
              support.
            </p>
          </div>
        ) : attempts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Quiz
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Date
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Score
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Duration
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {attempts.map((attempt) => {
                  // Calculate duration in minutes
                  const durationMs =
                    attempt.submittedAt.getTime() - attempt.startedAt.getTime();
                  const durationMinutes = Math.round(durationMs / (1000 * 60));

                  return (
                    <tr key={attempt.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {attempt.quizTitle || "Unknown Quiz"}
                        </div>
                        {attempt.quizDescription && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {attempt.quizDescription}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {format(attempt.submittedAt, "MMM d, yyyy")}
                        </div>
                        <div className="text-sm text-gray-500">
                          {format(attempt.submittedAt, "h:mm a")}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium">
                          {attempt.score !== null ? (
                            <span
                              className={`px-2 py-1 rounded-full ${
                                attempt.score >= 70
                                  ? "bg-green-100 text-green-800"
                                  : attempt.score >= 50
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {attempt.score}%
                            </span>
                          ) : (
                            <span className="text-gray-500">Not scored</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {durationMinutes} min
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {attempt.tabSwitchCount > 0 ? (
                            <span className="flex items-center text-xs text-amber-800 bg-amber-100 px-2 py-1 rounded-full">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4 mr-1"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {attempt.tabSwitchCount} tab switches
                            </span>
                          ) : (
                            <span className="flex items-center text-xs text-green-800 bg-green-100 px-2 py-1 rounded-full">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4 mr-1"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              Clean
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-xl font-semibold text-gray-600">
              You haven&apos;t taken any quizzes yet
            </p>
            <p className="text-gray-500 mt-2">
              Join a quiz to see your results here
            </p>
            <div className="flex justify-center gap-4 mt-6">
              <button
                onClick={() => router.push("/join")}
                className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
              >
                Find Quizzes
              </button>
              <button
                onClick={() => {
                  setRetryCount((count) => count + 1);
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
              >
                Refresh Data
              </button>
            </div>
          </div>
        )}
      </div>

      {user && attempts.length === 0 && !isLoading && !error && (
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">
            Troubleshooting
          </h3>
          <p className="text-yellow-800 mb-2">
            If you&apos;ve taken quizzes but don&apos;t see them here, it could
            be due to one of these reasons:
          </p>
          <ul className="list-disc list-inside text-yellow-800 mb-4">
            <li>The data is still being indexed in the database</li>
            <li>
              You&apos;re signed in with a different account than the one used
              to take quizzes
            </li>
            <li>
              There might be issues with your user&apos;s data permissions
            </li>
          </ul>
          <p className="text-yellow-800">
            User ID: {user.uid.substring(0, 8)}... (Check that this matches the
            ID used when taking quizzes)
          </p>
        </div>
      )}
    </div>
  );
}
