/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  // addDoc, // Removing unused import
  serverTimestamp,
  writeBatch,
  doc,
  setDoc,
} from "firebase/firestore";
import { db } from "@/firebase/client";
import { FiPlus, FiTrash, FiSave, FiArrowLeft } from "react-icons/fi";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { QuizDifficulty } from "@/types/quiz";

interface QuestionOption {
  text: string;
  isCorrect: boolean;
}

interface Question {
  text: string;
  options: QuestionOption[];
  points: number;
  type: string;
}

export default function NewQuizPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Quiz details state
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [duration, setDuration] = useState<number>(30); // Default overall duration in minutes
  const [accessCode, setAccessCode] = useState<string>("");
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [requiresAccessCode, setRequiresAccessCode] = useState<boolean>(false);
  const [isAutoCheck, setIsAutoCheck] = useState<boolean>(true);
  const [showAnswerReview, setShowAnswerReview] = useState<boolean>(true);
  const [examMode, setExamMode] = useState<"practice" | "strict">("practice");

  // Difficulty settings
  const [availableDifficulties] = useState<QuizDifficulty[]>(["easy", "medium", "hard"]);
  const [activeDifficulty, setActiveDifficulty] = useState<QuizDifficulty>("easy");
  const [difficultySettings, setDifficultySettings] = useState<{
    easy: { duration: number; pointsMultiplier: number };
    medium: { duration: number; pointsMultiplier: number };
    hard: { duration: number; pointsMultiplier: number };
  }>({
    easy: { duration: 30, pointsMultiplier: 1.0 },
    medium: { duration: 25, pointsMultiplier: 1.5 },
    hard: { duration: 20, pointsMultiplier: 2.0 },
  });

  // Questions state by difficulty
  const [questions, setQuestions] = useState<Record<QuizDifficulty, Question[]>>({
    easy: [],
    medium: [],
    hard: [],
  });

  // Helper function to add a new question to the current difficulty level
  const handleAddQuestion = () => {
    setQuestions((prev) => ({
      ...prev,
      [activeDifficulty]: [
        ...prev[activeDifficulty],
        {
          text: "",
          options: [
            { text: "", isCorrect: false },
            { text: "", isCorrect: false },
            { text: "", isCorrect: false },
            { text: "", isCorrect: false }
          ],
          points: 1,
          type: "mcq"
        },
      ],
    }));
  };

  // Helper function to remove a question
  const handleRemoveQuestion = (index: number) => {
    const updatedQuestions = { ...questions };
    updatedQuestions[activeDifficulty].splice(index, 1);
    setQuestions(updatedQuestions);
  };

  // Helper function to update question text
  const handleQuestionTextChange = (questionIndex: number, value: string) => {
    const updatedQuestions = { ...questions };
    updatedQuestions[activeDifficulty][questionIndex].text = value;
    setQuestions(updatedQuestions);
  };

  // Helper function to update question points
  const handlePointsChange = (questionIndex: number, value: number) => {
    const updatedQuestions = { ...questions };
    updatedQuestions[activeDifficulty][questionIndex].points = value;
    setQuestions(updatedQuestions);
  };

  // Helper function to update option text
  const handleOptionTextChange = (questionIndex: number, optionIndex: number, value: string) => {
    const updatedQuestions = { ...questions };
    updatedQuestions[activeDifficulty][questionIndex].options[optionIndex].text = value;
    setQuestions(updatedQuestions);
  };

  // Helper function to mark an option as correct
  const handleOptionCorrectChange = (questionIndex: number, optionIndex: number) => {
    const updatedQuestions = { ...questions };
    
    // Set all options to false first
    updatedQuestions[activeDifficulty][questionIndex].options.forEach((option, i) => {
      option.isCorrect = i === optionIndex;
    });
    
    setQuestions(updatedQuestions);
  };

  // Helper function to add a new option to a question
  const handleAddOption = (questionIndex: number) => {
    const updatedQuestions = { ...questions };
    updatedQuestions[activeDifficulty][questionIndex].options.push({ text: "", isCorrect: false });
    setQuestions(updatedQuestions);
  };

  // Helper function to remove an option from a question
  const handleRemoveOption = (questionIndex: number, optionIndex: number) => {
    if (questions[activeDifficulty][questionIndex].options.length <= 2) {
      setError("Each question must have at least 2 options");
      return;
    }

    const updatedQuestions = { ...questions };
    updatedQuestions[activeDifficulty][questionIndex].options.splice(optionIndex, 1);
    
    // If we removed the correct option, set the first option as correct
    const hasCorrectOption = updatedQuestions[activeDifficulty][questionIndex].options.some(
      option => option.isCorrect
    );
    
    if (!hasCorrectOption && updatedQuestions[activeDifficulty][questionIndex].options.length > 0) {
      updatedQuestions[activeDifficulty][questionIndex].options[0].isCorrect = true;
    }
    
    setQuestions(updatedQuestions);
  };

  // Helper function to generate a random access code
  const generateRandomCode = (length: number): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  // Validation function
  const validateQuiz = () => {
    if (!title.trim()) {
      setError("Quiz title is required");
      return false;
    }

    if (duration <= 0) {
      setError("Quiz duration must be greater than 0");
      return false;
    }

    // Check if there's at least one question in any difficulty level
    const hasDifficultyWithQuestions = Object.values(questions).some(
      difficultyQuestions => difficultyQuestions.length > 0
    );

    if (!hasDifficultyWithQuestions) {
      setError("Add at least one question to any difficulty level");
      return false;
    }

    // Validate all questions for all difficulties
    for (const difficulty of availableDifficulties) {
      for (let i = 0; i < questions[difficulty].length; i++) {
        const question = questions[difficulty][i];

        if (!question.text.trim()) {
          setError(`Question ${i + 1} in ${difficulty} difficulty is missing text`);
          setActiveDifficulty(difficulty);
          return false;
        }

        // Check if there's at least one correct option
        const hasCorrectOption = question.options.some(option => option.isCorrect);
        if (!hasCorrectOption) {
          setError(`Question ${i + 1} in ${difficulty} difficulty needs at least one correct answer`);
          setActiveDifficulty(difficulty);
          return false;
        }

        // Validate all options have text
        for (let j = 0; j < question.options.length; j++) {
          if (!question.options[j].text.trim()) {
            setError(`Option ${j + 1} in question ${i + 1} (${difficulty}) is missing text`);
            setActiveDifficulty(difficulty);
            return false;
          }
        }
      }
    }

    return true;
  };
  // Helper function to handle duration change for a specific difficulty
  const handleDifficultyDurationChange = (difficulty: QuizDifficulty, newDuration: number) => {
    setDifficultySettings(prev => ({
      ...prev,
      [difficulty]: {
        ...prev[difficulty],
        duration: newDuration
      }
    }));
  };

  // Helper function to handle points multiplier change for a specific difficulty
  const handleDifficultyMultiplierChange = (difficulty: QuizDifficulty, newMultiplier: number) => {
    setDifficultySettings(prev => ({
      ...prev,
      [difficulty]: {
        ...prev[difficulty],
        pointsMultiplier: newMultiplier
      }
    }));
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateQuiz()) {
      return;
    }

    try {
      setIsLoading(true);

      // Filter difficulties that have questions
      const diffWithQuestions = availableDifficulties.filter(
        diff => questions[diff].length > 0
      );

      // Create filtered difficulty settings object with only the difficulties that have questions
      const filteredDifficultySettings: Record<string, { duration: number; pointsMultiplier: number }> = {};
      diffWithQuestions.forEach(diff => {
        filteredDifficultySettings[diff] = difficultySettings[diff];
      });

      // Create the quiz document with the correct structure
      const quizData = {
        title,
        description,
        duration: Number(duration), // Keep overall duration for backward compatibility
        accessCode: accessCode || generateRandomCode(6),
        active: true,
        availableDifficulties: diffWithQuestions,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || "unknown",
        isAutoCheck,
        showAnswerReview,
        examMode,
        isPublic,
        requiresAccessCode: Boolean(requiresAccessCode || (accessCode && accessCode.length > 0)),
        updatedAt: serverTimestamp(),
        difficultySettings: filteredDifficultySettings,
      };

      // Create the quiz document
      const quizRef = doc(collection(db, "quizzes"));
      await setDoc(quizRef, quizData);

      // Create batch to add all questions efficiently
      const batch = writeBatch(db);

      // Add questions for each difficulty level as subcollections
      for (const difficulty of diffWithQuestions) {
        for (const question of questions[difficulty]) {
          // Create a document in the appropriate subcollection
          const questionRef = doc(collection(quizRef, `questions_${difficulty}`));
          
          batch.set(questionRef, {
            text: question.text,
            options: question.options,
            points: question.points,
            type: question.type,
          });
        }
      }

      // Commit all the question documents
      await batch.commit();

      // Navigate back to the quizzes page
      router.push("/quizzes");
    } catch (error: any) {
      console.error("Error creating quiz:", error);
      setError(error.message || "Failed to create quiz");
    } finally {
      setIsLoading(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Create New Quiz</h1>
        </div>
        <p className="text-gray-600">
          Add a new quiz with questions for multiple difficulty levels
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Quiz Details</h2>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Quiz Title<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter quiz title"
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                required
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter a description for this quiz"
                rows={3}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
              />
            </div>            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label
                  htmlFor="duration"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Default Duration (minutes)<span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                  min="1"
                  max="180"
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  You can customize duration per difficulty level below
                </p>
              </div>

              <div>
                <label
                  htmlFor="accessCode"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Access Code
                </label>
                <input
                  type="text"
                  id="accessCode"
                  value={accessCode}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase();
                    setAccessCode(code);
                    if (code.length > 0) {
                      setRequiresAccessCode(true);
                    }
                  }}
                  placeholder="Leave blank to auto-generate"
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  A random code will be generated if left blank
                </p>
              </div>
            </div>
            
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h3 className="text-md font-medium text-gray-800 mb-3">Difficulty Time Settings</h3>
              <p className="text-sm text-gray-600 mb-4">
                Customize time limits for each difficulty level. Users will see the time limit for their selected difficulty.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {availableDifficulties.map((diff) => (
                  <div key={diff} className={`p-4 rounded-lg border ${
                    diff === 'easy' ? 'border-green-200 bg-green-50' :
                    diff === 'medium' ? 'border-yellow-200 bg-yellow-50' :
                    'border-red-200 bg-red-50'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium capitalize">{diff}</h4>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        diff === 'easy' ? 'bg-green-100 text-green-800' :
                        diff === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {difficultySettings[diff].pointsMultiplier}x points
                      </span>
                    </div>
                    <div>
                      <label 
                        htmlFor={`duration-${diff}`}
                        className="block text-xs font-medium text-gray-500 mb-1"
                      >
                        Time Limit (minutes)
                      </label>
                      <input
                        id={`duration-${diff}`}
                        type="number"
                        value={difficultySettings[diff].duration}
                        onChange={(e) => handleDifficultyDurationChange(
                          diff as QuizDifficulty, 
                          parseInt(e.target.value) || difficultySettings[diff].duration
                        )}
                        min="1"
                        max="180"
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                      />
                    </div>
                    <div className="mt-2">
                      <label 
                        htmlFor={`multiplier-${diff}`}
                        className="block text-xs font-medium text-gray-500 mb-1"
                      >
                        Points Multiplier
                      </label>
                      <input
                        id={`multiplier-${diff}`}
                        type="number"
                        value={difficultySettings[diff].pointsMultiplier}
                        onChange={(e) => handleDifficultyMultiplierChange(
                          diff as QuizDifficulty, 
                          parseFloat(e.target.value) || difficultySettings[diff].pointsMultiplier
                        )}
                        min="0.1"
                        max="5"
                        step="0.1"
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center">
                <input
                  id="isPublic"
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 text-purple-600 border-gray-300 rounded"
                />
                <label htmlFor="isPublic" className="ml-2 text-gray-700">
                  Public Quiz
                </label>
              </div>

              <div className="flex items-center">
                <input
                  id="requiresAccessCode"
                  type="checkbox"
                  checked={requiresAccessCode}
                  onChange={(e) => {
                    setRequiresAccessCode(e.target.checked);
                    // If unchecking and there's an access code, clear it
                    if (!e.target.checked && accessCode.length > 0) {
                      if (confirm("Remove the access code too?")) {
                        setAccessCode("");
                      }
                    }
                  }}
                  className="h-4 w-4 text-purple-600 border-gray-300 rounded"
                />
                <label htmlFor="requiresAccessCode" className="ml-2 text-gray-700">
                  Require Access Code
                </label>
                <span className="ml-2 text-xs text-gray-500">
                  {requiresAccessCode ? "Access required" : "No access required"}
                </span>
              </div>

              <div className="flex items-center">
                <input
                  id="isAutoCheck"
                  type="checkbox"
                  checked={isAutoCheck}
                  onChange={(e) => setIsAutoCheck(e.target.checked)}
                  className="h-4 w-4 text-purple-600 border-gray-300 rounded"
                />
                <label htmlFor="isAutoCheck" className="ml-2 text-gray-700">
                  Auto-check Answers
                </label>
              </div>

              <div className="flex items-center">
                <input
                  id="showAnswerReview"
                  type="checkbox"
                  checked={showAnswerReview}
                  onChange={(e) => setShowAnswerReview(e.target.checked)}
                  className="h-4 w-4 text-purple-600 border-gray-300 rounded"
                />
                <label htmlFor="showAnswerReview" className="ml-2 text-gray-700">
                  Show answer review after submitting
                </label>
              </div>

              <div>
                <label htmlFor="examMode" className="block text-gray-700">
                  Exam mode
                </label>
                <select
                  id="examMode"
                  value={examMode}
                  onChange={(e) => setExamMode(e.target.value as "practice" | "strict")}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm"
                >
                  <option value="practice">Practice: fullscreen is offered, leaving it is fine</option>
                  <option value="strict">Strict: leaving fullscreen blocks the exam and is recorded</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="mt-8 space-y-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900">Questions</h2>
          </div>

          {/* Difficulty Tabs */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav
                className="-mb-px flex space-x-4"
                aria-label="Difficulty Tabs"
              >
                {availableDifficulties.map((difficultyTab) => (
                  <button
                    key={difficultyTab}
                    type="button"
                    onClick={() => setActiveDifficulty(difficultyTab)}
                    className={`whitespace-nowrap py-3 px-3 border-b-2 font-medium text-sm ${
                      activeDifficulty === difficultyTab
                        ? "border-purple-500 text-purple-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${
                        difficultyTab === "easy"
                          ? "bg-green-100 text-green-800"
                          : difficultyTab === "hard"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {difficultyTab.charAt(0).toUpperCase() + difficultyTab.slice(1)}
                    </span>
                    Questions ({questions[difficultyTab].length})
                  </button>
                ))}
              </nav>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Create questions for each difficulty level. Users will be able to choose from available difficulty levels.
            </p>
          </div>

          {/* Button to add a question */}
          <button
            type="button"
            onClick={handleAddQuestion}
            className="inline-flex items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            <FiPlus className="mr-2" /> Add {activeDifficulty.charAt(0).toUpperCase() + activeDifficulty.slice(1)} Question
          </button>

          {/* Questions list */}
          <div className="space-y-6 mt-4">
            {questions[activeDifficulty].length === 0 ? (
              <div className="text-center p-6 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-500">
                  No {activeDifficulty} questions yet. Click the button above to add one.
                </p>
              </div>
            ) : (
              questions[activeDifficulty].map((question, questionIndex) => (
                <div
                  key={questionIndex}
                  className="bg-white rounded-lg shadow overflow-hidden border border-gray-200"
                >
                  <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-md font-medium text-gray-900">
                      Question {questionIndex + 1}
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(questionIndex)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <FiTrash />
                    </button>
                  </div>

                  <div className="p-6 space-y-4">
                    <div>
                      <label
                        htmlFor={`question-${activeDifficulty}-${questionIndex}-text`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Question Text<span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id={`question-${activeDifficulty}-${questionIndex}-text`}
                        value={question.text}
                        onChange={(e) => handleQuestionTextChange(questionIndex, e.target.value)}
                        placeholder="Enter the question"
                        rows={2}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        required
                      />
                    </div>

                    <div>
                      <label
                        htmlFor={`question-${activeDifficulty}-${questionIndex}-points`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Points<span className="text-red-500">*</span>
                      </label>
                      <input
                        id={`question-${activeDifficulty}-${questionIndex}-points`}
                        type="number"
                        value={question.points}
                        onChange={(e) => handlePointsChange(questionIndex, parseInt(e.target.value) || 1)}
                        min="1"
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        required
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Options<span className="text-red-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAddOption(questionIndex)}
                          className="text-sm text-purple-600 hover:text-purple-800 flex items-center"
                        >
                          <FiPlus className="mr-1" size={14} /> Add Option
                        </button>
                      </div>

                      <div className="space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <div
                            key={optionIndex}
                            className="flex items-center space-x-2"
                          >
                            <div className="flex-grow">
                              <div className="relative flex items-center">
                                <input
                                  type="radio"
                                  name={`question-${activeDifficulty}-${questionIndex}-correct`}
                                  checked={option.isCorrect}
                                  onChange={() => handleOptionCorrectChange(questionIndex, optionIndex)}
                                  className="focus:ring-purple-500 h-4 w-4 text-purple-600 border-gray-300"
                                  required
                                />
                                <input
                                  type="text"
                                  value={option.text}
                                  onChange={(e) => handleOptionTextChange(questionIndex, optionIndex, e.target.value)}
                                  placeholder={`Option ${optionIndex + 1}`}
                                  className="ml-2 block w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                                  required
                                />
                              </div>
                              {option.isCorrect && (
                                <div className="pl-6 text-xs text-green-600 mt-0.5">
                                  Correct answer
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(questionIndex, optionIndex)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <FiTrash size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={() => router.push("/quizzes")}
            className="mr-4 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Saving...
              </>
            ) : (
              <>
                <FiSave className="mr-2" /> Save Quiz
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
