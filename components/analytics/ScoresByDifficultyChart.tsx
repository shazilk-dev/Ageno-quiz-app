"use client";

import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/firebase/client";

interface ScoreData {
  difficulty: string;
  averageScore: number;
  responseCount: number;
  scores: number[];
}

interface ScoresByDifficultyChartProps {
  quizId?: string;
}

const ScoresByDifficultyChart: React.FC<ScoresByDifficultyChartProps> = ({
  quizId,
}) => {
  const [scoreData, setScoreData] = useState<ScoreData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchScoresByDifficulty = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (!db) {
          throw new Error("Firebase database connection is not available");
        }

        // Create base collection reference
        const responsesCollection = collection(db, "responses");

        // Create query based on conditions
        let dataQuery;
        if (quizId) {
          dataQuery = query(
            responsesCollection,
            where("quizId", "==", quizId),
            orderBy("submittedAt", "desc")
          );
        } else {
          dataQuery = query(
            responsesCollection,
            orderBy("submittedAt", "desc")
          );
        }

        const querySnapshot = await getDocs(dataQuery);

        // Group by difficulty
        const difficultyMap: Record<string, number[]> = {
          easy: [],
          medium: [],
          hard: [],
        };

        querySnapshot.forEach((doc) => {
          const data = doc.data();

          // Skip responses without scores or difficulty
          if (data.score === null || data.score === undefined) return;

          // Use 'medium' as default if not specified
          const difficulty = data.selectedDifficulty || "medium";

          // Initialize array if not already
          if (!difficultyMap[difficulty]) {
            difficultyMap[difficulty] = [];
          }

          difficultyMap[difficulty].push(data.score);
        }); // Calculate averages and create final data array
        const processedData: ScoreData[] = Object.keys(difficultyMap)
          .map((difficulty) => {
            const scores = difficultyMap[difficulty];
            // Skip difficulties with no responses
            if (scores.length === 0) return null;

            const total = scores.reduce((sum, score) => sum + score, 0);
            const average =
              scores.length > 0 ? Math.round(total / scores.length) : 0;

            return {
              difficulty,
              averageScore: average,
              responseCount: scores.length,
              scores,
            };
          })
          // Filter out null entries from difficulties with no responses
          .filter((data): data is ScoreData => data !== null);

        // Sort by difficulty level (easy, medium, hard)
        const sortOrder: Record<string, number> = {
          easy: 0,
          medium: 1,
          hard: 2,
        };
        processedData.sort((a, b) => {
          return (
            (sortOrder[a.difficulty] || 999) - (sortOrder[b.difficulty] || 999)
          );
        });

        setScoreData(processedData);
      } catch (err) {
        console.error("Error fetching scores by difficulty:", err);
        setError("Failed to load score data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchScoresByDifficulty();
  }, [quizId]);

  if (isLoading) {
    return <div className="p-6 text-center">Loading score data...</div>;
  }

  if (error) {
    return <div className="p-6 text-center text-red-500">{error}</div>;
  }

  if (scoreData.length === 0) {
    return <div className="p-6 text-center">No score data available</div>;
  }
  // We'll use 100 as our maximum value for display purposes since scores are percentages

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h3 className="text-lg font-medium mb-4">Average Scores by Difficulty</h3>{" "}
      <div className="flex justify-around h-64 items-end mb-6 pt-6 border-b border-l">
        {scoreData.length === 0 ? (
          <div className="w-full flex items-center justify-center text-gray-500">
            No score data available
          </div>
        ) : (
          scoreData.map((data) => (
            <div key={data.difficulty} className="flex flex-col items-center">
              {/* Score value */}
              <div className="mb-2 font-medium">{data.averageScore}%</div>

              {/* Bar */}
              <div
                className={`w-16 ${getBgColorByDifficulty(
                  data.difficulty
                )} rounded-t transition-all duration-500 ease-in-out`}
                style={{
                  height: `${Math.max((data.averageScore / 100) * 100, 1)}%`,
                }}
              ></div>

              {/* X-axis label */}
              <div className="mt-2 capitalize font-medium">
                {data.difficulty}
                <div className="text-xs text-gray-500">
                  ({data.responseCount}{" "}
                  {data.responseCount === 1 ? "response" : "responses"})
                </div>
              </div>
            </div>
          ))
        )}
      </div>{" "}
      <div className="mt-4">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="py-2 text-left">Difficulty</th>
              <th className="py-2 text-left">Responses</th>
              <th className="py-2 text-left">Avg. Score</th>
            </tr>
          </thead>
          <tbody>
            {scoreData.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 text-center text-gray-500">
                  No data available
                </td>
              </tr>
            ) : (
              scoreData.map((data) => (
                <tr key={data.difficulty} className="border-t">
                  <td className="py-2 capitalize">
                    <span
                      className={`inline-block w-3 h-3 rounded-full mr-2 ${getBgColorByDifficulty(
                        data.difficulty
                      )}`}
                    ></span>
                    {data.difficulty}
                  </td>
                  <td className="py-2">{data.responseCount}</td>
                  <td className="py-2 font-medium">{data.averageScore}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function getBgColorByDifficulty(difficulty: string): string {
  switch (difficulty.toLowerCase()) {
    case "easy":
      return "bg-green-400";
    case "medium":
      return "bg-yellow-400";
    case "hard":
      return "bg-red-400";
    default:
      return "bg-blue-400";
  }
}

export default ScoresByDifficultyChart;
