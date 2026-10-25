"use client";

import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebase/client";
import { FiUsers, FiFileText, FiCheckCircle, FiClock } from "react-icons/fi";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QuizScoreDistribution from "@/components/analytics/QuizScoreDistribution";
import QuizTimeDistribution from "@/components/analytics/QuizTimeDistribution";
import { QuizResponse } from "@/types/quiz";

interface Quiz {
  id: string;
  title: string;
  description?: string;
  duration: number;
  accessCode?: string;
  createdAt: Timestamp | Date | number;
  createdBy: string;
  isAutoCheck: boolean;
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalQuizzes: 0,
    totalAttempts: 0,
    avgScore: 0,
  });
  const [recentQuizzes, setRecentQuizzes] = useState<Quiz[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<QuizResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);

        // Fetch users
        const usersSnapshot = await getDocs(collection(db, "users"));
        const totalUsers = usersSnapshot.size; // Fetch quizzes
        const quizzesSnapshot = await getDocs(collection(db, "quizzes"));
        const quizzes = quizzesSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title || "Untitled Quiz",
            description: data.description || "",
            duration: data.duration || 0,
            accessCode: data.accessCode,
            createdAt: data.createdAt,
            createdBy: data.createdBy || "Unknown",
            isAutoCheck: data.isAutoCheck || false,
          } as Quiz;
        });
        const totalQuizzes = quizzesSnapshot.size;

        // Fetch recent quizzes
        const sortedQuizzes = [...quizzes].sort((a, b) => {
          const dateA =
            typeof a.createdAt === "object" &&
            "toDate" in a.createdAt &&
            typeof a.createdAt.toDate === "function"
              ? a.createdAt.toDate()
              : new Date(Number(a.createdAt) || 0);
          const dateB =
            typeof b.createdAt === "object" &&
            "toDate" in b.createdAt &&
            typeof b.createdAt.toDate === "function"
              ? b.createdAt.toDate()
              : new Date(Number(b.createdAt) || 0);
          return dateB.getTime() - dateA.getTime();
        });
        setRecentQuizzes(sortedQuizzes.slice(0, 5)); // Fetch responses/attempts
        const responsesSnapshot = await getDocs(collection(db, "responses"));
        const responses = responsesSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            quizId: data.quizId || "",
            userId: data.userId || "",
            score: data.score,
            submittedAt: data.submittedAt,
            startedAt: data.startedAt,
            tabSwitchCount: data.tabSwitchCount,
          } as QuizResponse;
        });

        // Calculate stats
        const totalAttempts = responsesSnapshot.size;

        // Calculate average score
        let totalScore = 0;
        let validScores = 0;

        responses.forEach((response) => {
          if (response.score !== null && response.score !== undefined) {
            totalScore += response.score;
            validScores++;
          }
        });

        const avgScore =
          validScores > 0 ? Math.round(totalScore / validScores) : 0;

        // Get recent attempts
        const recentResponses = [...responses]
          .sort((a, b) => {
            const dateA =
              typeof a.submittedAt === "object" &&
              "toDate" in a.submittedAt &&
              typeof a.submittedAt.toDate === "function"
                ? a.submittedAt.toDate()
                : new Date(Number(a.submittedAt) || 0);
            const dateB =
              typeof b.submittedAt === "object" &&
              "toDate" in b.submittedAt &&
              typeof b.submittedAt.toDate === "function"
                ? b.submittedAt.toDate()
                : new Date(Number(b.submittedAt) || 0);
            return dateB.getTime() - dateA.getTime();
          })
          .slice(0, 5);

        // Enrich recent attempts with user and quiz info
        const enrichedResponses = await Promise.all(
          recentResponses.map(async (response) => {
            let quizTitle = "Unknown Quiz";
            let userName = "Unknown User";

            // Fetch quiz info
            if (response.quizId) {
              try {
                const quizDoc = await getDoc(
                  doc(db, "quizzes", response.quizId)
                );
                if (quizDoc.exists()) {
                  quizTitle = quizDoc.data().title || quizTitle;
                }
              } catch (error) {
                console.error("Error fetching quiz:", error);
              }
            }

            // Fetch user info
            if (response.userId) {
              try {
                const userDoc = await getDoc(doc(db, "users", response.userId));
                if (userDoc.exists()) {
                  userName =
                    userDoc.data().displayName ||
                    userDoc.data().email ||
                    userName;
                }
              } catch (error) {
                console.error("Error fetching user:", error);
              }
            }

            // Return a complete QuizResponse object
            return {
              ...response,
              quizTitle,
              userName,
            } as QuizResponse;
          })
        );

        setRecentAttempts(enrichedResponses);

        // Update stats
        setStats({
          totalUsers,
          totalQuizzes,
          totalAttempts,
          avgScore,
        });
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []); // Function to format date
  const formatDate = (
    timestamp: Timestamp | Date | number | { toDate(): Date } | undefined
  ): string => {
    if (!timestamp) return "Unknown";

    let date: Date;
    if (typeof timestamp === "object") {
      if ("toDate" in timestamp && typeof timestamp.toDate === "function") {
        // It's a Firestore Timestamp or any object with toDate method
        date = timestamp.toDate();
      } else {
        // It's a JavaScript Date object
        date = timestamp as Date;
      }
    } else {
      // It's a number (timestamp)
      date = new Date(Number(timestamp));
    }

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Function to handle quiz deletion
  const handleDeleteQuiz = async (quizId: string) => {
    if (!confirm("Are you sure you want to delete this quiz?")) return;

    try {
      // Delete the quiz document
      await deleteDoc(doc(db, "quizzes", quizId));

      // Update the UI
      setRecentQuizzes((prev) => prev.filter((quiz) => quiz.id !== quizId));
      setStats((prev) => ({ ...prev, totalQuizzes: prev.totalQuizzes - 1 }));
    } catch (error) {
      console.error("Error deleting quiz:", error);
      alert("Failed to delete quiz.");
    }
  };

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
                      onClick={() => handleDeleteQuiz(quiz.id)}
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
                    By {attempt.userName} • {formatDate(attempt.submittedAt)}
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
      {recentAttempts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Performance Analytics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-4">
              <QuizScoreDistribution
                responses={recentAttempts}
                title="Score Distribution Overview"
              />
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <QuizTimeDistribution responses={recentAttempts} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
