"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { buildLeaderboard } from "@/lib/leaderboard";
import { fetchLeaderboard, type Leaderboard } from "@/lib/quizzes-api";
import LeaderboardFilters from "./LeaderboardFilters";
import UserRank from "./UserRank";
import TopPerformers from "./TopPerformers";

const LeaderboardPage = () => {
  const { user } = useAuth();
  const [data, setData] = useState<Leaderboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [timeFrame, setTimeFrame] = useState<"all" | "week" | "month">("all");
  const [category, setCategory] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("");

  const handleFilterChange = (
    type: "timeFrame" | "category" | "difficulty",
    value: string
  ) => {
    switch (type) {
      case "timeFrame":
        setTimeFrame(value as "all" | "week" | "month");
        break;
      case "category":
        setCategory(value);
        break;
      case "difficulty":
        setDifficulty(value);
        break;
    }
  };

  // One request per filter change; the server looks up names and titles in one batch.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchLeaderboard({ timeFrame, quizId: category, difficulty })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        console.error("Error fetching leaderboard data:", err);
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load leaderboard data. Please try again later."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [timeFrame, category, difficulty, reloadKey]);

  const leaderboardData = useMemo(
    () =>
      data ? buildLeaderboard(data.rows, data.users, data.quizzes, category) : [],
    [data, category]
  );
  const categories = useMemo(
    () =>
      Object.entries(data?.quizzes ?? {}).map(([id, title]) => ({ id, title })),
    [data]
  );
  const currentUserEntry = useMemo(
    () =>
      (user && leaderboardData.find((entry) => entry.userId === user.uid)) ||
      null,
    [user, leaderboardData]
  );

  // Format the date to a readable string
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  // Format seconds into minutes and seconds
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-neutral-50">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl text-black font-bold mb-4 bg-clip-text bg-gradient-to-r from-purple-primary to-tech-blue-light">
              Leaderboard
            </h1>
            <p className="text-gray-600 max-w-2xl mx-auto">
              See how you stack up against other quiz-takers. The top performers
              are showcased here based on their scores, difficulty level, and
              completion time.
            </p>
          </div>
          {/* Filters Component */}
          <LeaderboardFilters
            categories={categories}
            timeFrame={timeFrame}
            category={category}
            difficulty={difficulty}
            onFilterChange={handleFilterChange}
          />
          {/* Current User Rank Card */}
          {user && (
            <UserRank
              currentUserEntry={currentUserEntry}
              isLoading={isLoading}
              isGlobalRanking={!category}
            />
          )}
          {/* Leaderboard table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex justify-center items-center py-20">
                <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
                <span className="ml-3 text-gray-600">
                  Loading leaderboard data...
                </span>
              </div>
            ) : error ? (
              <div className="text-center py-20">
                <p className="text-red-500 mb-2">{error}</p>
                <button
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Try again
                </button>
              </div>
            ) : leaderboardData.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-gray-600">
                  No leaderboard data available yet.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Be the first to complete a quiz and claim the top spot!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="py-4 px-6 text-left text-gray-500 font-medium">
                        Rank
                      </th>
                      <th className="py-4 px-6 text-left text-gray-500 font-medium">
                        User
                      </th>
                      <th className="py-4 px-6 text-left text-gray-500 font-medium">
                        {!category ? "Unique Quizzes" : "Quiz"}
                      </th>
                      <th className="py-4 px-6 text-left text-gray-500 font-medium">
                        {!category ? "Mastery Level" : "Difficulty"}
                      </th>
                      <th className="py-4 px-6 text-left text-gray-500 font-medium">
                        {!category ? "Avg. Score" : "Score"}
                      </th>
                      <th className="py-4 px-6 text-left text-gray-500 font-medium">
                        {!category ? "Best Time" : "Time Taken"}
                      </th>
                      <th className="py-4 px-6 text-left text-gray-500 font-medium">
                        {!category ? "Latest Quiz" : "Completed On"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {leaderboardData.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`hover:bg-gray-50 ${
                          user && entry.userId === user.uid
                            ? "bg-indigo-50"
                            : ""
                        }`}
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center">
                            {entry.rank === 1 && (
                              <span className="text-2xl mr-2">🥇</span>
                            )}
                            {entry.rank === 2 && (
                              <span className="text-2xl mr-2">🥈</span>
                            )}
                            {entry.rank === 3 && (
                              <span className="text-2xl mr-2">🥉</span>
                            )}
                            {entry.rank && entry.rank > 3 ? (
                              <span className="font-bold text-gray-700">
                                {entry.rank}
                              </span>
                            ) : !entry.rank && entry.rank !== 0 ? (
                              <span className="font-bold text-gray-700">-</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-4 px-6 font-medium">
                          {entry.username}
                        </td>
                        <td className="py-4 px-6 text-gray-700">
                          {!category 
                            ? `${entry.uniqueQuizCount || 0} unique` 
                            : entry.quizTitle}
                          {!category && (
                            <span className="block text-xs text-gray-500">
                              ({entry.totalAttempts || 0} total attempts)
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {!category ? (
                            <span
                              className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                                entry.masteryLevel === "Master"
                                  ? "bg-purple-100 text-purple-800"
                                  : entry.masteryLevel === "Expert"
                                  ? "bg-blue-100 text-blue-800"
                                  : entry.masteryLevel === "Advanced"
                                  ? "bg-indigo-100 text-indigo-800"
                                  : entry.masteryLevel === "Practiced"
                                  ? "bg-yellow-100 text-yellow-800"                              : "bg-green-100 text-green-800"
                            }`}
                          >
                            {entry.masteryLevel || "Beginner"}
                          </span>
                          ) : (
                            <span
                              className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                                entry.difficulty === "hard"
                                  ? "bg-red-100 text-red-800"
                                  : entry.difficulty === "medium"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {entry.difficulty || "Basic"}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <span className="font-bold text-indigo-600">
                            {entry.score}%
                          </span>
                          {!category && entry.normalizedScore && (
                            <span className="block text-xs text-gray-500">
                              Total: {Math.round(entry.normalizedScore)} pts
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-gray-700">
                          {formatTime(entry.timeTaken)}
                        </td>
                        <td className="py-4 px-6 text-gray-500">
                          {formatDate(entry.completedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* Top Performers Component */}
          <TopPerformers
            topEntries={leaderboardData.slice(0, 3)}
            showGlobalRanking={!category}
          />
        </div>
      </div>
    </div>
  );
};

export default LeaderboardPage;
