"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebase/client";
import { useAuth } from "@/contexts/auth-context";
import LeaderboardFilters from "./LeaderboardFilters";
import UserRank from "./UserRank";
import TopPerformers from "./TopPerformers";

type LeaderboardEntry = {
  id: string;
  username: string;
  quizTitle: string;
  score: number;
  completedAt: Date;
  timeTaken: number; // in seconds
  rank?: number;
  quizId?: string;
  difficulty?: string;
  userId?: string;
  normalizedScore?: number; // Score adjusted for difficulty
  uniqueQuizCount?: number; // Number of unique quizzes completed
  totalAttempts?: number; // Total number of quiz attempts/completions
  masteryLevel?: string; // Calculated mastery level based on attempts
};

// Difficulty multipliers for score normalization
const DIFFICULTY_MULTIPLIERS = {
  basic: 1.0,
  medium: 1.3,
  hard: 1.6,
  "": 1.0, // Default
};

const LeaderboardPage = () => {
  const { user } = useAuth();
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFrame, setTimeFrame] = useState<"all" | "week" | "month">("all");
  const [category, setCategory] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [currentUserEntry, setCurrentUserEntry] =
    useState<LeaderboardEntry | null>(null);

  // Cache for user names and quiz titles
  const [userInfoCache, setUserInfoCache] = useState<Record<string, string>>(
    {}
  );
  const [quizInfoCache, setQuizInfoCache] = useState<Record<string, string>>(
    {}
  );

  // Handle filter changes
  const handleFilterChange = useCallback(
    (type: "timeFrame" | "category" | "difficulty", value: string) => {
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
    },
    []
  );
  // Fetch user display names
  const fetchUserInfo = useCallback(
    async (userIds: string[]) => {
      try {
        const uniqueIds = [...new Set(userIds)].filter(
          (id) => !userInfoCache[id]
        );
        if (uniqueIds.length === 0) return;

        const userInfo: Record<string, string> = {};

        // Fetch actual user data from Firestore's users collection
        for (const userId of uniqueIds) {
          try {
            const userDoc = await getDoc(doc(db, "users", userId));

            if (userDoc.exists()) {
              const userData = userDoc.data();
              // Use displayName from Firestore, or email prefix as fallback,
              // or User ID as last resort
              userInfo[userId] =
                userData.displayName ||
                (userData.email
                  ? userData.email.split("@")[0]
                  : `User ${userId.substring(0, 6)}`);
            } else {
              // Fallback if user document doesn't exist
              userInfo[userId] = `User ${userId.substring(0, 6)}`;
            }
          } catch (err) {
            console.error(`Error fetching user ${userId}:`, err);
            userInfo[userId] = `User ${userId.substring(0, 6)}`;
          }
        }

        setUserInfoCache((prev) => ({ ...prev, ...userInfo }));
      } catch (error) {
        console.error("Error fetching user info:", error);
      }
    },
    [userInfoCache]
  );

  // Fetch quiz titles
  const fetchQuizInfo = useCallback(
    async (quizIds: string[]) => {
      try {
        const uniqueIds = [...new Set(quizIds)].filter(
          (id) => !quizInfoCache[id] && id
        );
        if (uniqueIds.length === 0) return;

        const quizInfo: Record<string, string> = {};

        // Make one request per quiz ID
        for (const quizId of uniqueIds) {
          try {
            if (!quizId) continue;

            const quizDoc = await getDoc(doc(db, "quizzes", quizId));

            if (quizDoc.exists()) {
              const quizData = quizDoc.data();
              quizInfo[quizId] =
                quizData.title || `Quiz ${quizId.substring(0, 6)}`;
            } else {
              quizInfo[quizId] = `Quiz ${quizId.substring(0, 6)}`;
            }
          } catch (err) {
            console.error(`Error fetching quiz ${quizId}:`, err);
            quizInfo[quizId] = `Quiz ${quizId.substring(0, 6)}`;
          }
        }

        setQuizInfoCache((prev) => ({ ...prev, ...quizInfo }));
      } catch (error) {
        console.error("Error fetching quiz info:", error);
      }
    },
    [quizInfoCache]
  );

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      try {
        setIsLoading(true);
        setError(null); // Use 'responses' collection
        const responsesRef = collection(db, "responses");
        const queryConstraints: Array<ReturnType<typeof where>> = [];

        // Apply time frame filter
        if (timeFrame !== "all") {
          const dateLimit = new Date();
          if (timeFrame === "week") {
            dateLimit.setDate(dateLimit.getDate() - 7);
          } else {
            dateLimit.setMonth(dateLimit.getMonth() - 1);
          }

          queryConstraints.push(
            where("submittedAt", ">=", Timestamp.fromDate(dateLimit))
          );
        }

        // Apply category filter
        if (category) {
          queryConstraints.push(where("quizId", "==", category));
        }

        // Apply difficulty filter - may need to adjust based on your data model
        if (difficulty) {
          queryConstraints.push(where("selectedDifficulty", "==", difficulty));
        }

        // Create the final query with all filters
        const leaderboardQuery = query(
          responsesRef,
          ...queryConstraints,
          orderBy("score", "desc"),
          limit(100) // Fetch more entries to sort by time later
        );

        const querySnapshot = await getDocs(leaderboardQuery);

        const entries: LeaderboardEntry[] = [];
        const userIds: string[] = [];
        const quizIds: string[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();

          // Only add valid user and quiz IDs to the arrays
          if (data.userId) userIds.push(data.userId);
          if (data.quizId) quizIds.push(data.quizId);

          // Calculate time taken in seconds
          const timeTaken =
            data.startedAt && data.submittedAt
              ? Math.floor(
                  (data.submittedAt.toDate().getTime() -
                    data.startedAt.toDate().getTime()) /
                    1000
                )
              : 0;

          // Get the difficulty level with a default of empty string
          const difficultyLevel = data.selectedDifficulty || "";

          // Calculate normalized score based on difficulty
          const rawScore = typeof data.score === "number" ? data.score : 0;
          const multiplier =
            DIFFICULTY_MULTIPLIERS[
              difficultyLevel as keyof typeof DIFFICULTY_MULTIPLIERS
            ] || 1.0;
          const normalizedScore = rawScore * multiplier;

          // Map the fields to leaderboard entries
          entries.push({
            id: doc.id,
            username: data.userId || "Anonymous User",
            quizTitle: data.quizId || "Unknown Quiz",
            score: rawScore,
            completedAt: data.submittedAt?.toDate() || new Date(),
            timeTaken: timeTaken,
            quizId: data.quizId || "",
            difficulty: difficultyLevel,
            userId: data.userId,
            normalizedScore: normalizedScore,
          });
        });

        // Fetch quiz and user info
        await fetchQuizInfo(quizIds);
        await fetchUserInfo(userIds);

        // Create aggregated user rankings when showing all quizzes (no specific quiz category selected)
        let sortedEntries: LeaderboardEntry[] = [];

        if (!category) {
          // Global leaderboard - aggregate by user
          const userScores: Record<
            string,
            {
              userId: string;
              totalNormalizedScore: number;
              quizCount: number;
              bestTime: number;
              latestCompletion: Date;
              entries: LeaderboardEntry[];
              uniqueQuizIds: Set<string>; // Track unique quiz IDs
              totalAttempts: number; // Track total attempts
            }
          > = {};

          // Group and calculate combined metrics by user
          entries.forEach((entry) => {
            if (!entry.userId) return;

            if (!userScores[entry.userId]) {
              userScores[entry.userId] = {
                userId: entry.userId,
                totalNormalizedScore: 0,
                quizCount: 0,
                bestTime: Infinity,
                latestCompletion: new Date(0),
                entries: [],
                uniqueQuizIds: new Set<string>(),
                totalAttempts: 0,
              };
            }

            // Add this entry's score to user's total
            userScores[entry.userId].totalNormalizedScore +=
              entry.normalizedScore || 0;
            
            // Increment total attempts counter
            userScores[entry.userId].totalAttempts += 1;
            
            // Add to quiz count (this represents the old way - will be kept for comparison)
            userScores[entry.userId].quizCount += 1;
            
            // Add this quiz ID to the unique set if it exists
            if (entry.quizId) {
              userScores[entry.userId].uniqueQuizIds.add(entry.quizId);
            }

            // Track user's best time (lowest value)
            if (entry.timeTaken < userScores[entry.userId].bestTime) {
              userScores[entry.userId].bestTime = entry.timeTaken;
            }

            // Track user's latest completion
            if (entry.completedAt > userScores[entry.userId].latestCompletion) {
              userScores[entry.userId].latestCompletion = entry.completedAt;
            }

            // Store the entry
            userScores[entry.userId].entries.push(entry);
          });

          // Function to calculate mastery level based on unique quizzes and total attempts
          const calculateMasteryLevel = (uniqueCount: number, totalAttempts: number): string => {
            if (uniqueCount === 0) return "Beginner";
            
            // Calculate average attempts per quiz
            const avgAttemptsPerQuiz = totalAttempts / uniqueCount;
            
            if (uniqueCount >= 20) {
              return "Master";
            } else if (uniqueCount >= 10) {
              return "Expert";
            } else if (uniqueCount >= 5) {
              return "Advanced";
            } else if (avgAttemptsPerQuiz >= 3) {
              return "Practiced";
            } else {
              return "Beginner";
            }
          };
          
          // Create aggregated entries for global leaderboard
          const aggregatedEntries: LeaderboardEntry[] = Object.values(
            userScores
          ).map((userData) => {
            // Use the most recent entry as a base
            const mostRecentEntry = userData.entries.sort(
              (a, b) => b.completedAt.getTime() - a.completedAt.getTime()
            )[0];

            // Get the count of unique quizzes
            const uniqueQuizCount = userData.uniqueQuizIds.size;
            
            // Get the total attempts count
            const totalAttempts = userData.totalAttempts;
            
            // Calculate mastery level
            const masteryLevel = calculateMasteryLevel(uniqueQuizCount, totalAttempts);

            // Create a combined entry with aggregate scores
            return {
              ...mostRecentEntry,
              id: `global-${userData.userId}`,
              quizTitle: `${uniqueQuizCount}/${totalAttempts} completed`,
              score: Math.round(
                userData.totalNormalizedScore / userData.quizCount
              ),
              normalizedScore: userData.totalNormalizedScore,
              timeTaken: userData.bestTime,
              completedAt: userData.latestCompletion,
              uniqueQuizCount,
              totalAttempts,
              masteryLevel,
            };
          });

          // Sort by total normalized score and then by best time
          sortedEntries = aggregatedEntries.sort((a, b) => {
            // First sort by normalized score (highest first)
            if ((b.normalizedScore || 0) !== (a.normalizedScore || 0)) {
              return (b.normalizedScore || 0) - (a.normalizedScore || 0);
            }
            // If scores are the same, sort by time taken (lowest first)
            return a.timeTaken - b.timeTaken;
          });
        } else {
          // Specific quiz category is selected - sort individual entries
          sortedEntries = entries.sort((a, b) => {
            // First sort by normalized score (highest first)
            if ((b.normalizedScore || 0) !== (a.normalizedScore || 0)) {
              return (b.normalizedScore || 0) - (a.normalizedScore || 0);
            }
            // If scores are the same, sort by time taken (lowest first)
            return a.timeTaken - b.timeTaken;
          });
        }

        // Assign ranks
        sortedEntries.forEach((entry, index) => {
          entry.rank = index + 1;
        }); // Update entries with cached user and quiz info
        const updatedEntries = sortedEntries.map((entry) => {
          // Map quiz IDs to quiz titles
          let quizTitle = entry.quizTitle;
          if (quizInfoCache[entry.quizTitle]) {
            quizTitle = quizInfoCache[entry.quizTitle];
          }

          // Map user IDs to usernames - making sure to use the userId field
          // which contains the actual Firebase user ID
          let username = entry.username;
          if (entry.userId && userInfoCache[entry.userId]) {
            username = userInfoCache[entry.userId];
          }

          return {
            ...entry,
            username,
            quizTitle,
          };
        });

        // Find the current user's entry if authenticated
        if (user) {
          const userEntry = updatedEntries.find(
            (entry) => entry.userId === user.uid
          );
          setCurrentUserEntry(userEntry || null);
        }

        // Limit displayed entries to 50
        setLeaderboardData(updatedEntries.slice(0, 50));
      } catch (err) {
        console.error("Error fetching leaderboard data:", err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load leaderboard data. Please try again later.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboardData();
  }, [
    timeFrame,
    category,
    difficulty,
    user,
    userInfoCache,
    quizInfoCache,
    fetchQuizInfo,
    fetchUserInfo,
  ]);

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
                  onClick={() => window.location.reload()}
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
