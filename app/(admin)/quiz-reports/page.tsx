/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Alert, Button } from "@/components/ui";
import { adminReports } from "@/lib/admin-api";
import { toQuizResponse } from "@/lib/admin-types";
import { ApiRequestError } from "@/lib/api-client";
import QuizScoreDistribution from "@/components/analytics/QuizScoreDistribution";
import QuizTimeDistribution from "@/components/analytics/QuizTimeDistribution";
import { FiFilter, FiDownload } from "react-icons/fi";
import { QuizResponse } from "@/types/quiz";

const describeError = (error: unknown) =>
  error instanceof ApiRequestError
    ? error.message
    : "We couldn't load the reports. Try again.";

export default function QuizReportsPage() {
  const [responses, setResponses] = useState<QuizResponse[]>([]);
  const [filteredResponses, setFilteredResponses] = useState<QuizResponse[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [quizOptions, setQuizOptions] = useState<
    { id: string; title: string }[]
  >([]);
  const [selectedQuiz, setSelectedQuiz] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"all" | "week" | "month">("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  // Results come a page at a time, newest first. `cursor` is where the next (older) page starts.
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Function to filter responses based on selected filters
  const filterResponses = useCallback(() => {
    let filtered = [...responses];

    // Filter by date range
    if (dateRange !== "all") {
      const now = new Date();
      const cutoffDate = new Date();

      if (dateRange === "week") {
        cutoffDate.setDate(now.getDate() - 7); // Last 7 days
      } else if (dateRange === "month") {
        cutoffDate.setMonth(now.getMonth() - 1); // Last 30 days
      }

      filtered = filtered.filter((response) => {
        const submittedDate = typeof response.submittedAt === 'object' && 'toDate' in response.submittedAt
          ? response.submittedAt.toDate()
          : response.submittedAt ? new Date(response.submittedAt) : new Date();
        return submittedDate >= cutoffDate;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const dateA = typeof a.submittedAt === 'object' && 'toDate' in a.submittedAt
        ? a.submittedAt.toDate()
        : a.submittedAt ? new Date(a.submittedAt as number) : new Date(0);
      const dateB = typeof b.submittedAt === 'object' && 'toDate' in b.submittedAt
        ? b.submittedAt.toDate()
        : b.submittedAt ? new Date(b.submittedAt as number) : new Date(0);
        
      return sortOrder === "asc" 
        ? dateA.getTime() - dateB.getTime()
        : dateB.getTime() - dateA.getTime();
    });
    
    setFilteredResponses(filtered);
  }, [responses, dateRange, sortOrder]);

  // Apply filtering when dependencies change
  useEffect(() => {
    filterResponses();
  }, [filterResponses]);
  

  // Format date to readable string
  const formatDate = (timestamp: Date | { toDate(): Date } | number | undefined): string => {
    if (!timestamp) return "Unknown";

    try {
      const date = typeof timestamp === 'object' && 'toDate' in timestamp
        ? timestamp.toDate() 
        : new Date(timestamp as number | string);
      
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      });
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Invalid Date";
    }
  };

  // Calculate time taken in minutes and seconds
  const calculateTimeTaken = (
    startTime: Date | { toDate(): Date } | number | undefined, 
    endTime: Date | { toDate(): Date } | number | undefined
  ): string => {
    if (!startTime || !endTime) return "Unknown";
    
    try {
      const start = typeof startTime === 'object' && 'toDate' in startTime
        ? startTime.toDate()
        : new Date(startTime as number | string);
      const end = typeof endTime === 'object' && 'toDate' in endTime
        ? endTime.toDate()
        : new Date(endTime as number | string);
        
      const diffSeconds = Math.floor((end.getTime() - start.getTime()) / 1000);
      const minutes = Math.floor(diffSeconds / 60);
      const seconds = diffSeconds % 60;

      return `${minutes}m ${seconds}s`;
    } catch (error) {
      console.error("Error calculating time taken:", error);
      return "Unknown";
    }
  };

  // One request for a page of results: the server looks up quiz titles and names in a single batch.
  const fetchReportsData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const page = await adminReports.page({
        quizId: selectedQuiz === "all" ? undefined : selectedQuiz,
      });
      setResponses(page.rows.map(toQuizResponse));
      setQuizOptions(page.quizzes);
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch (error) {
      // If the quiz filter can't be served yet, fall back to every quiz and say so.
      if (error instanceof ApiRequestError && error.code === "index_required") {
        setSelectedQuiz("all");
      }
      setLoadError(describeError(error));
    } finally {
      setIsLoading(false);
    }
  }, [selectedQuiz]);

  // Fetch reports data on component mount
  useEffect(() => {
    void fetchReportsData();
  }, [fetchReportsData]);

  const loadMore = async () => {
    if (!cursor) return;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const page = await adminReports.page({
        cursor,
        quizId: selectedQuiz === "all" ? undefined : selectedQuiz,
      });
      setResponses((current) => [...current, ...page.rows.map(toQuizResponse)]);
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch (error) {
      setLoadError(describeError(error));
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Calculate stats
  const calculateStats = () => {
    if (filteredResponses.length === 0) {
      return {
        avgScore: 0,
        highestScore: 0,
        lowestScore: 0,
        avgTime: "0m 0s",
        totalAttempts: 0,
      };
    }

    let totalScore = 0;
    let highestScore = 0;
    let lowestScore = 100;
    let totalTimeSeconds = 0;

    filteredResponses.forEach((response: QuizResponse) => {
      // Process scores
      if (response.score !== null && response.score !== undefined) {
        totalScore += response.score;
        highestScore = Math.max(highestScore, response.score);
        lowestScore = Math.min(lowestScore, response.score);
      }

      // Process time taken
      if (response.startedAt && response.submittedAt) {
        const start = typeof response.startedAt === 'object' && 'toDate' in response.startedAt
          ? response.startedAt.toDate()
          : new Date(response.startedAt);
        const end = typeof response.submittedAt === 'object' && 'toDate' in response.submittedAt
          ? response.submittedAt.toDate()
          : new Date(response.submittedAt);
        totalTimeSeconds += Math.floor(
          (end.getTime() - start.getTime()) / 1000
        );
      }
    });

    const avgScore = Math.round(totalScore / filteredResponses.length);
    const avgTimeSeconds = Math.floor(
      totalTimeSeconds / filteredResponses.length
    );
    const avgMinutes = Math.floor(avgTimeSeconds / 60);
    const avgSeconds = avgTimeSeconds % 60;

    return {
      avgScore,
      highestScore,
      lowestScore: Math.min(lowestScore, 100), // In case there are no valid scores
      avgTime: `${avgMinutes}m ${avgSeconds}s`,
      totalAttempts: filteredResponses.length,
    };
  };

  const stats = calculateStats();

  // Export data to CSV
  const exportToCSV = () => {
    if (filteredResponses.length === 0) return;

    const headers = [
      "Quiz Title",
      "User Name",
      "Score (%)",
      "Time Taken",
      "Submitted At",
      "Tab Switches",
      "Left Fullscreen",
      "Focus Lost",
    ];

    const rows = filteredResponses.map((response: QuizResponse) => [
      response.quizTitle || "Unknown Quiz",
      response.userName || "Unknown User",
      response.score !== null && response.score !== undefined
        ? response.score
        : "N/A",
      calculateTimeTaken(response.startedAt, response.submittedAt),
      formatDate(response.submittedAt),
      response.tabSwitchCount || 0,
      response.fullscreenExits || 0,
      response.blurCount || 0,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any[]) => row.map((cell: any) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "quiz-reports.csv");
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quiz Reports</h1>
          <p className="text-gray-600">
            View and analyze quiz performance data
          </p>
        </div>

        <button
          onClick={exportToCSV}
          disabled={filteredResponses.length === 0}
          className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium ${
            filteredResponses.length === 0
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          }`}
        >
          <FiDownload className="mr-2" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center flex-grow">
            <FiFilter className="mr-2 text-gray-400" />
            <div className="w-full md:w-64 md:mr-4">
              <select
                value={selectedQuiz}
                onChange={(e) => setSelectedQuiz(e.target.value)}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
              >
                <option value="all">All Quizzes</option>
                {quizOptions.map((quiz) => (
                  <option key={quiz.id} value={quiz.id}>
                    {quiz.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="w-full md:w-auto">
              <select
                value={dateRange}
                onChange={(e) =>
                  setDateRange(e.target.value as "all" | "week" | "month")
                }
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
              >
                <option value="all">All Time</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
              </select>
            </div>

            <div className="w-full md:w-auto">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "desc" | "asc")}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loadError && (
        <Alert
          variant="error"
          title="Couldn't load the reports"
          className="mb-6"
          action={
            <Button variant="secondary" size="sm" onClick={() => void (cursor && !isLoading ? loadMore() : fetchReportsData())}>
              Try again
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-500">Total Attempts</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">
            {stats.totalAttempts}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-500">Average Score</p>
          <p className="mt-1 text-3xl font-semibold text-purple-600">
            {stats.avgScore}%
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-500">Highest Score</p>
          <p className="mt-1 text-3xl font-semibold text-green-600">
            {stats.highestScore}%
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-500">Lowest Score</p>
          <p className="mt-1 text-3xl font-semibold text-red-600">
            {stats.lowestScore}%
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-500">Average Time</p>
          <p className="mt-1 text-3xl font-semibold text-blue-600">
            {stats.avgTime}
          </p>
        </div>
      </div>

      {cursor && (
        <p className="mb-6 text-sm text-gray-600">
          The numbers and charts cover the {responses.length} most recent of {total} results. Load
          older results below to include them.
        </p>
      )}

      {/* Visualizations */}
      {filteredResponses.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Score Distribution
            </h3>
            <QuizScoreDistribution responses={filteredResponses} />
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Completion Time
            </h3>
            <QuizTimeDistribution responses={filteredResponses} />
          </div>
        </div>
      )}

      {/* Responses Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Quiz Attempts</h3>
        </div>

        {isLoading ? (
          <div className="p-6 text-center">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
            <p className="mt-2 text-gray-600">Loading reports...</p>
          </div>
        ) : filteredResponses.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-600">
              No quiz attempts found for the selected filters.
            </p>
            <button
              onClick={() => {
                setSelectedQuiz("all");
                setDateRange("all");
              }}
              className="mt-2 text-purple-600 hover:text-purple-800 underline"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quiz
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time Taken
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tab Switches
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Left Fullscreen
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Focus Lost
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredResponses.map((response) => (
                  <tr key={response.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {response.quizTitle || "Unknown Quiz"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {response.userName || "Unknown User"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {response.score !== null &&
                      response.score !== undefined ? (
                        <div
                          className={`text-sm font-medium ${
                            response.score >= 70
                              ? "text-green-600"
                              : response.score >= 40
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {response.score}%
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">Not Graded</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {calculateTimeTaken(
                        response.startedAt,
                        response.submittedAt
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(response.submittedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {response.tabSwitchCount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {response.fullscreenExits || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {response.blurCount || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && !isLoading && (
          <div className="border-t border-gray-200 p-4 text-center">
            <p className="mb-3 text-sm text-gray-600">
              Showing {responses.length} of {total} results
            </p>
            <Button variant="secondary" onClick={() => void loadMore()} loading={isLoadingMore}>
              Load older results
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
