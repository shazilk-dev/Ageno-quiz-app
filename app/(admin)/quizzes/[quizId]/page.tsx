/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, collection, query, getDocs } from "firebase/firestore";
import { db } from "@/firebase/client";
import {
  FiEdit,
  FiArrowLeft,
  FiClock,
  FiCheckSquare,
  FiLock,
} from "react-icons/fi";
import Link from "next/link";

interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  type: "mcq"; // Can expand to support more types later
}

interface Quiz {
  id: string;
  title: string;
  description: string;
  duration: number;
  accessCode: string | null;
  createdBy: string;
  createdAt: any;
  isAutoCheck: boolean;
  difficulty?: "easy" | "medium" | "hard";
  questions: QuizQuestion[];
}

export default function ViewQuizPage() {
  const { quizId } = useParams() as { quizId: string };
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);

  // Load quiz data on component mount
  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        setIsLoading(true);

        // Get quiz document
        const quizDoc = await getDoc(doc(db, "quizzes", quizId));

        if (!quizDoc.exists()) {
          setError("Quiz not found");
          return;
        }

        const quizData = quizDoc.data();

        // Get questions
        const questionsQuery = query(
          collection(db, "quizzes", quizId, "questions")
        );
        const questionsSnapshot = await getDocs(questionsQuery);
        const questionsList = questionsSnapshot.docs.map((doc) => ({
          id: doc.id,
          text: doc.data().text || "",
          options: doc.data().options || [],
          correctIndex: doc.data().correctIndex || 0,
          type: doc.data().type || "mcq",
        }));

        // Assemble the full quiz object
        const fullQuiz: Quiz = {
          id: quizId,
          title: quizData.title || "Untitled Quiz",
          description: quizData.description || "",
          duration: quizData.duration || 0,
          accessCode: quizData.accessCode || null,
          createdBy: quizData.createdBy || "Unknown",
          createdAt: quizData.createdAt,
          isAutoCheck: quizData.isAutoCheck ?? true,
          difficulty: quizData.difficulty || "medium",
          questions: questionsList,
        };

        setQuiz(fullQuiz);
      } catch (err) {
        console.error("Error loading quiz:", err);
        setError("Failed to load quiz data.");
      } finally {
        setIsLoading(false);
      }
    };

    if (quizId) {
      fetchQuiz();
    }
  }, [quizId]);

  // Format date to readable string
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "Unknown";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Format duration in minutes
  const formatDuration = (durationInMinutes: number): string => {
    if (durationInMinutes < 60) {
      return `${durationInMinutes} minute${durationInMinutes !== 1 ? "s" : ""}`;
    } else {
      const hours = Math.floor(durationInMinutes / 60);
      const minutes = durationInMinutes % 60;
      return `${hours} hour${hours !== 1 ? "s" : ""} ${
        minutes > 0 ? `${minutes} minute${minutes !== 1 ? "s" : ""}` : ""
      }`;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin h-12 w-12 border-4 border-purple-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 p-4 rounded-md">
          <h2 className="text-lg font-medium text-red-800">Error</h2>
          <p className="text-red-600">{error || "Quiz not found"}</p>
          <div className="mt-4">
            <Link
              href="/quizzes"
              className="text-purple-600 hover:text-purple-800 font-medium"
            >
              Return to Quiz Management
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center mb-4">
          <Link
            href="/quizzes"
            className="mr-4 text-gray-600 hover:text-gray-800"
          >
            <FiArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{quiz.title}</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
          <p className="text-gray-600 mb-4 sm:mb-0">
            {quiz.description || "No description provided."}
          </p>

          <Link
            href={`/quizzes/${quizId}/edit`}
            className="inline-flex items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            <FiEdit className="mr-2" /> Edit Quiz
          </Link>
        </div>
      </div>

      {/* Quiz Meta Information */}
      <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Quiz Details</h2>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center mb-4">
                <FiClock className="text-gray-500 mr-2" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Duration</p>
                  <p className="text-gray-600">
                    {formatDuration(quiz.duration)}
                  </p>
                </div>
              </div>
              <div className="flex items-center mb-4">
                <div className="text-gray-500 mr-2">
                  <FiCheckSquare />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Auto Check
                  </p>
                  <p className="text-gray-600">
                    {quiz.isAutoCheck ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </div>{" "}
              <div className="flex items-center mb-4">
                <div className="text-gray-500 mr-2">
                  {/* Using FiTag icon for difficulty */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                    <line x1="7" y1="7" x2="7.01" y2="7"></line>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Difficulty
                  </p>
                  <p className="text-gray-600">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        quiz.difficulty === "easy"
                          ? "bg-green-100 text-green-800"
                          : quiz.difficulty === "hard"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {quiz.difficulty
                        ? quiz.difficulty.charAt(0).toUpperCase() +
                          quiz.difficulty.slice(1)
                        : "Medium"}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="text-gray-500 mr-2">
                  <FiLock />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Access Code
                  </p>
                  <p className="text-gray-600">
                    {quiz.accessCode ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {quiz.accessCode}
                      </span>
                    ) : (
                      "None (public access)"
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500">
                Created by {quiz.createdBy}
              </p>
              {quiz.createdAt && (
                <p className="text-sm text-gray-500">
                  Created on {formatDate(quiz.createdAt)}
                </p>
              )}
              <p className="text-sm text-gray-500 mt-2">
                Total questions: {quiz.questions?.length || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Questions Preview */}
      <div className="mt-8 space-y-6">
        <h2 className="text-lg font-medium text-gray-900">Quiz Questions</h2>

        {quiz.questions.length > 0 ? (
          quiz.questions.map((question, questionIndex) => (
            <div
              key={questionIndex}
              className="bg-white rounded-lg shadow overflow-hidden"
            >
              <div className="p-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-md font-medium text-gray-900">
                  Question {questionIndex + 1}
                </h3>
              </div>

              <div className="p-6">
                <p className="text-gray-900 font-medium mb-4">
                  {question.text}
                </p>

                <div className="space-y-3">
                  {question.options.map((option, optionIndex) => (
                    <div
                      key={optionIndex}
                      className={`p-3 border rounded-md ${
                        question.correctIndex === optionIndex
                          ? "border-green-300 bg-green-50"
                          : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center">
                        <div
                          className={`w-4 h-4 rounded-full mr-3 ${
                            question.correctIndex === optionIndex
                              ? "bg-green-600"
                              : "border border-gray-400"
                          }`}
                        ></div>
                        <span
                          className={
                            question.correctIndex === optionIndex
                              ? "font-medium"
                              : ""
                          }
                        >
                          {option}
                        </span>
                      </div>
                      {question.correctIndex === optionIndex && (
                        <div className="mt-2 pl-7 text-xs text-green-600 font-medium">
                          Correct answer
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-yellow-50 border border-yellow-100 text-yellow-800 p-4 rounded-md">
            <p>This quiz does not have any questions yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
