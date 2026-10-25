/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFirestore } from "@/hooks/useFirestore";
import { useAuth } from "@/contexts/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import ImageUploader from "./ImageUploader";
import DifficultySettings from "./DifficultySettings";
import {
  saveAllQuestionsByDifficulty,
  getQuestionsByDifficulty,
} from "@/firebase/quizDifficulty";

interface QuizQuestion {
  id: string;
  text: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  correctAnswer?: string;
  points: number;
  imageUrl?: string;
}

interface QuizFormProps {
  initialQuiz?: {
    id?: string;
    title: string;
    description: string;
    timeLimit: number;
    active: boolean;
    code: string;
    questions: QuizQuestion[];
    requiresAccessCode?: boolean;
    availableDifficulties?: string[]; // Added to support difficulty levels
    difficultySettings?: {
      easy?: { duration: number; pointsMultiplier: number };
      medium?: { duration: number; pointsMultiplier: number };
      hard?: { duration: number; pointsMultiplier: number };
    };
  };
  mode: "create" | "edit";
  onSubmitSuccess?: (quizId: string) => void;
}

export default function QuizForm({
  initialQuiz,
  mode,
  onSubmitSuccess,
}: QuizFormProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { createDocument, updateDocument, isLoading } = useFirestore("quizzes");
  const defaultQuestion = useMemo(
    () => ({
      id: crypto.randomUUID(),
      text: "",
      options: [
        { id: crypto.randomUUID(), text: "", isCorrect: false },
        { id: crypto.randomUUID(), text: "", isCorrect: false },
        { id: crypto.randomUUID(), text: "", isCorrect: false },
        { id: crypto.randomUUID(), text: "", isCorrect: false },
      ],
      points: 1,
      imageUrl: "",
    }),
    []
  );

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timeLimit, setTimeLimit] = useState(30);
  const [active, setActive] = useState(true);
  const [code, setCode] = useState("");
  const [requiresAccessCode, setRequiresAccessCode] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([defaultQuestion]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isAutoCheck, setIsAutoCheck] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState("");

  // New state for difficulty levels
  const [availableDifficulties, setAvailableDifficulties] = useState<string[]>([
    "easy",
    "medium",
    "hard",
  ]);
  const [currentDifficulty, setCurrentDifficulty] = useState<string>("medium");
  const [questionsByDifficulty, setQuestionsByDifficulty] = useState<{
    easy: QuizQuestion[];
    medium: QuizQuestion[];
    hard: QuizQuestion[];
  }>({
    easy: [],
    medium: [defaultQuestion],
    hard: [],
  });

  // New state for difficulty settings
  const [difficultySettings, setDifficultySettings] = useState<{
    easy: { duration: number; pointsMultiplier: number };
    medium: { duration: number; pointsMultiplier: number };
    hard: { duration: number; pointsMultiplier: number };
  }>({
    easy: { duration: 30, pointsMultiplier: 1.0 },
    medium: { duration: 25, pointsMultiplier: 1.5 },
    hard: { duration: 20, pointsMultiplier: 2.0 },
  });

  // Initialize form with initial quiz data if in edit mode
  useEffect(() => {
    if (initialQuiz) {
      setTitle(initialQuiz.title);
      setDescription(initialQuiz.description);
      setTimeLimit(initialQuiz.timeLimit);
      setActive(initialQuiz.active);
      setCode(initialQuiz.code);
      setRequiresAccessCode(
        initialQuiz.requiresAccessCode !== undefined
          ? initialQuiz.requiresAccessCode
          : true
      );

      // Load available difficulties if they exist
      const availableDiffs = initialQuiz.availableDifficulties || ["medium"];
      setAvailableDifficulties(availableDiffs);

      // Load difficulty settings if they exist
      if (initialQuiz.difficultySettings) {
        setDifficultySettings({
          easy: initialQuiz.difficultySettings.easy || {
            duration: 30,
            pointsMultiplier: 1.0,
          },
          medium: initialQuiz.difficultySettings.medium || {
            duration: 25,
            pointsMultiplier: 1.5,
          },
          hard: initialQuiz.difficultySettings.hard || {
            duration: 20,
            pointsMultiplier: 2.0,
          },
        });
      }

      if (initialQuiz.id && mode === "edit") {
        // Load questions for each difficulty if in edit mode and we have an ID
        const loadQuestionsByDifficulty = async () => {
          try {
            // Create an object to store questions by difficulty
            const questionsByDiff = {
              easy: [] as QuizQuestion[],
              medium: [] as QuizQuestion[],
              hard: [] as QuizQuestion[],
            };

            // Load questions for each available difficulty
            for (const difficulty of availableDiffs) {
              const loadedQuestions = await getQuestionsByDifficulty(
                initialQuiz.id!,
                difficulty
              );
              // Use type assertion to tell TypeScript this is a valid key
              (questionsByDiff as Record<string, QuizQuestion[]>)[difficulty] =
                loadedQuestions.length > 0
                  ? loadedQuestions
                  : difficulty === "medium"
                  ? [defaultQuestion]
                  : [];
            }

            // Update state with the loaded questions
            setQuestionsByDifficulty(questionsByDiff);

            // Set the current questions to the medium difficulty or first available difficulty
            const defaultDifficulty = availableDiffs.includes("medium")
              ? "medium"
              : availableDiffs[0];
            setCurrentDifficulty(defaultDifficulty);
            setQuestions(
              (questionsByDiff as Record<string, QuizQuestion[]>)[
                defaultDifficulty
              ]
            );
          } catch (error) {
            console.error("Error loading questions by difficulty:", error);

            // Fallback to using questions from initialQuiz if loading fails
            const questionsToSet =
              initialQuiz.questions?.length > 0
                ? initialQuiz.questions
                : [defaultQuestion];

            setQuestions(questionsToSet);
            setQuestionsByDifficulty({
              easy: [],
              medium: questionsToSet,
              hard: [],
            });
          }
        };

        loadQuestionsByDifficulty();
      } else {
        // For new quizzes, just use the default setup
        const questionsToSet =
          initialQuiz.questions?.length > 0
            ? initialQuiz.questions
            : [defaultQuestion];

        setQuestions(questionsToSet);
        setQuestionsByDifficulty({
          easy: [],
          medium: questionsToSet,
          hard: [],
        });
      }

      // Load available difficulties if they exist
      if (initialQuiz.availableDifficulties) {
        setAvailableDifficulties(initialQuiz.availableDifficulties);
      }
    }
  }, [initialQuiz, defaultQuestion, mode]);

  // Generate a random access code
  const generateAccessCode = () => {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed similar looking characters
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length)
      );
    }
    setCode(result);
  };

  // Add a new question to the current difficulty level
  const addQuestion = () => {
    const newQuestion = {
      id: crypto.randomUUID(),
      text: "",
      options: [
        { id: crypto.randomUUID(), text: "", isCorrect: false },
        { id: crypto.randomUUID(), text: "", isCorrect: false },
        { id: crypto.randomUUID(), text: "", isCorrect: false },
        { id: crypto.randomUUID(), text: "", isCorrect: false },
      ],
      points: 1,
    };

    // Update both the main questions array and the difficulty-specific array
    const newQuestions = [...questions, newQuestion];
    setQuestions(newQuestions);

    // Update the questions for the current difficulty
    const updatedQuestionsByDifficulty = { ...questionsByDifficulty };
    updatedQuestionsByDifficulty[
      currentDifficulty as keyof typeof questionsByDifficulty
    ] = [
      ...updatedQuestionsByDifficulty[
        currentDifficulty as keyof typeof questionsByDifficulty
      ],
      newQuestion,
    ];
    setQuestionsByDifficulty(updatedQuestionsByDifficulty);

    setCurrentQuestionIndex(questions.length);
  };

  // Duplicate a question
  const duplicateQuestion = (questionId: string) => {
    const questionToDuplicate = questions.find(
      (q: QuizQuestion) => q.id === questionId
    );
    if (!questionToDuplicate) return;

    const duplicatedQuestion = {
      ...questionToDuplicate,
      id: crypto.randomUUID(),
      options: questionToDuplicate.options.map(
        (option: { id: string; text: string; isCorrect: boolean }) => ({
          ...option,
          id: crypto.randomUUID(),
        })
      ),
    };

    const newQuestions = [...questions];
    const index = questions.findIndex((q: QuizQuestion) => q.id === questionId);
    newQuestions.splice(index + 1, 0, duplicatedQuestion);

    setQuestions(newQuestions);
    setCurrentQuestionIndex(index + 1);
  };

  // Remove a question
  const removeQuestion = (questionId: string) => {
    if (questions.length === 1) {
      setFormError("Quiz must have at least one question");
      return;
    }

    const currentIndex = questions.findIndex(
      (q: QuizQuestion) => q.id === questionId
    );
    const newQuestions = questions.filter(
      (q: QuizQuestion) => q.id !== questionId
    );
    setQuestions(newQuestions);

    // Adjust current index if needed
    if (currentIndex >= newQuestions.length) {
      setCurrentQuestionIndex(newQuestions.length - 1);
    } else {
      setCurrentQuestionIndex(currentIndex);
    }

    setFormError(null);
  };

  // Navigate to previous question
  const previousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  // Navigate to next question
  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  // Update question text
  const updateQuestionText = (questionId: string, text: string) => {
    setQuestions(
      questions.map((q: QuizQuestion) =>
        q.id === questionId ? { ...q, text } : q
      )
    );
  };

  // Update question points
  const updateQuestionPoints = (questionId: string, points: number) => {
    setQuestions(
      questions.map((q: QuizQuestion) =>
        q.id === questionId ? { ...q, points } : q
      )
    );
  };

  // Update option text
  const updateOptionText = (
    questionId: string,
    optionId: string,
    text: string
  ) => {
    setQuestions(
      questions.map((q: QuizQuestion) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map(
                (o: { id: string; text: string; isCorrect: boolean }) =>
                  o.id === optionId ? { ...o, text } : o
              ),
            }
          : q
      )
    );
  };

  // Set correct option
  const setCorrectOption = (questionId: string, optionId: string) => {
    setQuestions(
      questions.map((q: QuizQuestion) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map(
                (o: { id: string; text: string; isCorrect: boolean }) => ({
                  ...o,
                  isCorrect: o.id === optionId,
                })
              ),
            }
          : q
      )
    );
  };

  // Add a new option to a question
  const addOption = (questionId: string) => {
    setQuestions(
      questions.map((q: QuizQuestion) =>
        q.id === questionId
          ? {
              ...q,
              options: [
                ...q.options,
                { id: crypto.randomUUID(), text: "", isCorrect: false },
              ],
            }
          : q
      )
    );
  };

  // Remove an option from a question
  const removeOption = (questionId: string, optionId: string) => {
    const question = questions.find((q: QuizQuestion) => q.id === questionId);
    if (!question || question.options.length <= 2) {
      setFormError("Questions must have at least two options");
      return;
    }

    setQuestions(
      questions.map((q: QuizQuestion) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.filter(
                (o: { id: string; text: string; isCorrect: boolean }) =>
                  o.id !== optionId
              ),
            }
          : q
      )
    );
    setFormError(null);
  };

  // Move question up in the order
  const moveQuestionUp = (index: number) => {
    if (index <= 0) return;

    const newQuestions = [...questions];
    const temp = newQuestions[index];
    newQuestions[index] = newQuestions[index - 1];
    newQuestions[index - 1] = temp;

    setQuestions(newQuestions);
    setCurrentQuestionIndex(index - 1);
  };

  // Move question down in the order
  const moveQuestionDown = (index: number) => {
    if (index >= questions.length - 1) return;

    const newQuestions = [...questions];
    const temp = newQuestions[index];
    newQuestions[index] = newQuestions[index + 1];
    newQuestions[index + 1] = temp;

    setQuestions(newQuestions);
    setCurrentQuestionIndex(index + 1);
  };

  // Handle image upload for a question
  const handleImageUpload = (questionId: string, imageUrl: string) => {
    setQuestions(
      questions.map((q: QuizQuestion) =>
        q.id === questionId ? { ...q, imageUrl } : q
      )
    );
  };

  // Handle image removal for a question
  const handleImageRemove = (questionId: string) => {
    setQuestions(
      questions.map((q: QuizQuestion) =>
        q.id === questionId ? { ...q, imageUrl: "" } : q
      )
    );
  };

  // Export questions to JSON
  const exportQuestions = () => {
    const dataStr = JSON.stringify(questions, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    const exportFileDefaultName = `${title
      .replace(/\s+/g, "-")
      .toLowerCase()}-questions.json`;

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  };

  // Import questions from text
  const handleImportQuestions = () => {
    try {
      const importedQuestions = JSON.parse(importText);

      if (!Array.isArray(importedQuestions)) {
        throw new Error(
          "Import format is invalid. Expected an array of questions."
        );
      }

      // Validate basic structure
      for (const q of importedQuestions) {
        if (!q.text || !Array.isArray(q.options)) {
          throw new Error(
            "One or more questions is missing required fields (text, options)."
          );
        }

        // Ensure each option has required fields
        for (const option of q.options) {
          if (
            typeof option.text !== "string" ||
            typeof option.isCorrect !== "boolean"
          ) {
            throw new Error(
              "One or more options is missing required fields (text, isCorrect)."
            );
          }
        }

        // Ensure there's at least one correct answer
        if (!q.options.some((o: any) => o.isCorrect)) {
          throw new Error(
            "Each question must have at least one correct answer."
          );
        }
      }

      // Add IDs if they don't exist
      const questionsWithIds = importedQuestions.map((q: any) => ({
        ...q,
        id: q.id || crypto.randomUUID(),
        points: q.points || 1,
        options: q.options.map((o: any) => ({
          ...o,
          id: o.id || crypto.randomUUID(),
        })),
      }));

      setQuestions(questionsWithIds);
      setCurrentQuestionIndex(0);
      setIsImporting(false);
      setImportText("");
      setSuccess("Questions imported successfully!");

      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      setFormError(
        `Import failed: ${
          err instanceof Error ? err.message : "Invalid format"
        }`
      );
    }
  };

  // Validate the form
  const validateForm = () => {
    // Check required fields
    if (!title.trim()) {
      setFormError("Quiz title is required");
      return false;
    }

    if (!description.trim()) {
      setFormError("Quiz description is required");
      return false;
    }

    if (requiresAccessCode && !code.trim()) {
      setFormError(
        "Access code is required when 'Requires Access Code' is enabled"
      );
      return false;
    }

    // Validate duration
    if (timeLimit < 5 || timeLimit > 180) {
      setFormError("Time limit must be between 5 and 180 minutes");
      return false;
    }

    // Validate questions
    for (const question of questions) {
      if (!question.text.trim()) {
        setFormError("All questions must have text");
        return false;
      }

      if (question.points < 1) {
        setFormError("Points must be at least 1 for each question");
        return false;
      }

      // Check if at least one option is marked as correct
      if (!question.options.some((o: any) => o.isCorrect)) {
        setFormError("Each question must have at least one correct answer");
        return false;
      }

      // Validate options
      for (const option of question.options) {
        if (!option.text.trim()) {
          setFormError("All options must have text");
          return false;
        }
      }
    }

    return true;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setFormError("You must be logged in to create a quiz");
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      setFormError(null);

      // Save current questions to the current difficulty before submission
      const finalQuestionsByDifficulty = { ...questionsByDifficulty };
      finalQuestionsByDifficulty[
        currentDifficulty as keyof typeof questionsByDifficulty
      ] = questions;

      const quizData = {
        title,
        description,
        timeLimit, // Keep for backward compatibility
        active,
        code,
        requiresAccessCode,
        questions, // Keep for backward compatibility
        availableDifficulties, // Add available difficulties
        difficultySettings, // Add difficulty-specific settings
        createdBy: user.uid,
        createdAt: new Date(),
        autoCheck: isAutoCheck,
      };

      let result;

      if (mode === "create") {
        result = await createDocument(quizData);

        // Save questions by difficulty for the new quiz
        await saveAllQuestionsByDifficulty(
          result.id,
          finalQuestionsByDifficulty,
          availableDifficulties
        );

        setSuccess("Quiz created successfully!");
      } else if (mode === "edit" && initialQuiz?.id) {
        result = await updateDocument(initialQuiz.id, {
          ...quizData,
          updatedAt: new Date(),
        });

        // Save questions by difficulty for the existing quiz
        await saveAllQuestionsByDifficulty(
          initialQuiz.id,
          finalQuestionsByDifficulty,
          availableDifficulties
        );

        setSuccess("Quiz updated successfully!");
      }

      // Call onSubmit callback if provided
      if (result && onSubmitSuccess) {
        onSubmitSuccess(typeof result === "object" ? result.id : result);
      }

      // Reset form after creating a new quiz
      if (mode === "create") {
        setTitle("");
        setDescription("");
        setTimeLimit(30);
        setActive(true);
        setCode("");
        setQuestions([defaultQuestion]);

        // Redirect to quizzes list after a short delay
        setTimeout(() => {
          router.push("/quizzes");
        }, 2000);
      }
    } catch (err) {
      if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError("Failed to save quiz. Please try again.");
      }
    }
  };

  // Switch between difficulty levels
  const switchDifficulty = (difficulty: string) => {
    // Save current questions for the current difficulty
    const updatedQuestionsByDifficulty = { ...questionsByDifficulty };
    updatedQuestionsByDifficulty[
      currentDifficulty as keyof typeof questionsByDifficulty
    ] = questions;

    // Switch to the selected difficulty and load its questions
    setCurrentDifficulty(difficulty);
    setQuestions(
      updatedQuestionsByDifficulty[
        difficulty as keyof typeof questionsByDifficulty
      ]
    );

    // Reset current question index
    setCurrentQuestionIndex(0);
  };

  // Toggle a difficulty in availableDifficulties array
  const toggleDifficulty = (difficulty: string) => {
    if (availableDifficulties.includes(difficulty)) {
      // Remove difficulty if it's already selected
      if (availableDifficulties.length > 1) {
        // Ensure at least one difficulty is selected
        setAvailableDifficulties(
          availableDifficulties.filter((d) => d !== difficulty)
        );
      }
    } else {
      // Add difficulty if not already selected
      setAvailableDifficulties([...availableDifficulties, difficulty]);
    }
  };

  // Handler for updating difficulty duration
  const handleDurationChange = (difficulty: string, duration: number) => {
    setDifficultySettings((prev) => ({
      ...prev,
      [difficulty]: {
        ...prev[difficulty as keyof typeof prev],
        duration,
      },
    }));
  };

  // Handler for updating difficulty point multiplier
  const handleMultiplierChange = (
    difficulty: string,
    pointsMultiplier: number
  ) => {
    setDifficultySettings((prev) => ({
      ...prev,
      [difficulty]: {
        ...prev[difficulty as keyof typeof prev],
        pointsMultiplier,
      },
    }));
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h1 className="text-2xl font-bold mb-6">
        {mode === "create" ? "Create New Quiz" : "Edit Quiz"}
      </h1>

      {formError && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-md">
          {formError}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 text-green-600 rounded-md">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Quiz details section */}
          <div className="bg-gray-50 p-4 rounded-md">
            <h2 className="text-xl font-semibold mb-4">Quiz Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label
                  htmlFor="title"
                  className="block text-sm font-medium mb-1"
                >
                  Quiz Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-purple-500"
                  placeholder="Enter quiz title"
                  required
                />
              </div>

              <div className="col-span-2">
                <label
                  htmlFor="description"
                  className="block text-sm font-medium mb-1"
                >
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-purple-500"
                  placeholder="Enter quiz description"
                  rows={3}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="timeLimit"
                  className="block text-sm font-medium mb-1"
                >
                  Time Limit (minutes) <span className="text-red-500">*</span>
                </label>
                <input
                  id="timeLimit"
                  type="number"
                  min="5"
                  max="180"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value) || 30)}
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <div className="flex items-center mb-2">
                  <input
                    id="requiresAccessCode"
                    type="checkbox"
                    checked={requiresAccessCode}
                    onChange={(e) => setRequiresAccessCode(e.target.checked)}
                    className="h-4 w-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="requiresAccessCode" className="ml-2 text-sm">
                    Require access code to join quiz
                  </label>
                </div>

                {requiresAccessCode && (
                  <>
                    <label
                      htmlFor="code"
                      className="block text-sm font-medium mb-1"
                    >
                      Access Code <span className="text-red-500">*</span>
                    </label>
                    <div className="flex">
                      <input
                        id="code"
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        className="flex-1 px-4 py-2 border rounded-l-md focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g. ABC123"
                        required={requiresAccessCode}
                      />
                      <button
                        type="button"
                        onClick={generateAccessCode}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-r-md hover:bg-gray-300"
                      >
                        Generate
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="col-span-2">
                <div className="flex items-center">
                  <input
                    id="autoCheck"
                    type="checkbox"
                    checked={isAutoCheck}
                    onChange={(e) => setIsAutoCheck(e.target.checked)}
                    className="h-4 w-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="autoCheck" className="ml-2 text-sm">
                    Auto-check answers (show correct/incorrect immediately)
                  </label>
                </div>
              </div>

              <div className="col-span-2">
                <div className="flex items-center">
                  <input
                    id="active"
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="active" className="ml-2 text-sm">
                    Active (quiz is available for students to take)
                  </label>
                </div>
              </div>

              {/* Difficulty Settings Component */}
              {availableDifficulties.length > 0 && (
                <div className="col-span-2 mt-4">
                  <DifficultySettings
                    availableDifficulties={availableDifficulties}
                    difficultySettings={difficultySettings}
                    onDurationChange={handleDurationChange}
                    onMultiplierChange={handleMultiplierChange}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Questions section */}
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Questions</h2>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsImporting(true)}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={exportQuestions}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                  disabled={questions.length === 0}
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => setIsReordering(!isReordering)}
                  className={`px-3 py-1 rounded-md text-sm ${
                    isReordering
                      ? "bg-purple-100 text-purple-700"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {isReordering ? "Done Reordering" : "Reorder"}
                </button>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Add Question
                </button>
              </div>
            </div>

            {isImporting && (
              <div className="mb-6 p-4 bg-gray-50 rounded-md">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">Import Questions</h3>
                  <button
                    type="button"
                    onClick={() => setIsImporting(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    &times;
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Paste in JSON format questions. The format must match the quiz
                  question structure.
                </p>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                  placeholder='[{"text": "Question text", "options": [{"text": "Option 1", "isCorrect": true}, {"text": "Option 2", "isCorrect": false}], "points": 1}]'
                  rows={10}
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={handleImportQuestions}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                    disabled={!importText.trim()}
                  >
                    Import
                  </button>
                </div>
              </div>
            )}

            {/* Difficulty level switcher */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex space-x-2">
                {availableDifficulties.map((difficulty) => (
                  <button
                    key={difficulty}
                    type="button"
                    onClick={() => switchDifficulty(difficulty)}
                    className={`px-3 py-1 rounded-md text-sm ${
                      currentDifficulty === difficulty
                        ? "bg-purple-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex space-x-2">
                {["easy", "medium", "hard"].map((difficulty) => (
                  <button
                    key={difficulty}
                    type="button"
                    onClick={() => toggleDifficulty(difficulty)}
                    className={`px-3 py-1 rounded-md text-sm ${
                      availableDifficulties.includes(difficulty)
                        ? "bg-purple-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Question navigation */}
            {!isReordering && questions.length > 0 && (
              <div className="flex justify-between items-center mb-4 bg-gray-100 p-2 rounded-md">
                <button
                  type="button"
                  onClick={previousQuestion}
                  disabled={currentQuestionIndex === 0}
                  className="px-3 py-1 bg-white text-gray-700 rounded-md border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm font-medium">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </span>
                <button
                  type="button"
                  onClick={nextQuestion}
                  disabled={currentQuestionIndex === questions.length - 1}
                  className="px-3 py-1 bg-white text-gray-700 rounded-md border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}

            {/* Questions editor or reorder view */}
            {isReordering ? (
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="font-medium mb-4">Reorder Questions</h3>
                <div className="space-y-2">
                  {questions.map((question, index) => (
                    <div
                      key={question.id}
                      className={`flex items-center justify-between p-3 bg-white border ${
                        index === currentQuestionIndex
                          ? "border-purple-300 ring-1 ring-purple-500"
                          : "border-gray-200"
                      } rounded-md`}
                    >
                      <div className="flex items-center">
                        <span className="font-medium text-gray-500 w-8 text-center">
                          {index + 1}
                        </span>
                        <span className="truncate max-w-md">
                          {question.text || "Untitled question"}
                        </span>
                      </div>
                      <div className="flex space-x-1">
                        <button
                          type="button"
                          onClick={() => moveQuestionUp(index)}
                          disabled={index === 0}
                          className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestionDown(index)}
                          disabled={index === questions.length - 1}
                          className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentQuestionIndex(index)}
                          className="p-1 text-purple-600 hover:text-purple-800"
                          title="Edit"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <AnimatePresence mode="wait">
                  {questions.length > 0 && (
                    <motion.div
                      key={questions[currentQuestionIndex]?.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.2 }}
                      className="bg-gray-50 p-4 rounded-md"
                    >
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-medium">
                          Question {currentQuestionIndex + 1}
                        </h3>
                        <div className="flex space-x-2">
                          <button
                            type="button"
                            onClick={() =>
                              duplicateQuestion(
                                questions[currentQuestionIndex].id
                              )
                            }
                            className="text-purple-600 hover:text-purple-800"
                            title="Duplicate question"
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              removeQuestion(questions[currentQuestionIndex].id)
                            }
                            className="text-red-600 hover:text-red-800"
                            title="Remove question"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="mb-4">
                        <label
                          htmlFor={`question-${questions[currentQuestionIndex].id}`}
                          className="block text-sm font-medium mb-1"
                        >
                          Question <span className="text-red-500">*</span>
                        </label>
                        <input
                          id={`question-${questions[currentQuestionIndex].id}`}
                          type="text"
                          value={questions[currentQuestionIndex].text}
                          onChange={(e) =>
                            updateQuestionText(
                              questions[currentQuestionIndex].id,
                              e.target.value
                            )
                          }
                          className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-purple-500"
                          placeholder="Enter question"
                          required
                        />
                      </div>

                      <ImageUploader
                        questionId={questions[currentQuestionIndex].id}
                        initialImageUrl={
                          questions[currentQuestionIndex].imageUrl
                        }
                        onImageUpload={handleImageUpload}
                        onImageRemove={handleImageRemove}
                      />

                      <div className="mb-4">
                        <label
                          htmlFor={`points-${questions[currentQuestionIndex].id}`}
                          className="block text-sm font-medium mb-1"
                        >
                          Points
                        </label>
                        <input
                          id={`points-${questions[currentQuestionIndex].id}`}
                          type="number"
                          min="1"
                          value={questions[currentQuestionIndex].points}
                          onChange={(e) =>
                            updateQuestionPoints(
                              questions[currentQuestionIndex].id,
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-32 px-4 py-2 border rounded-md focus:ring-2 focus:ring-purple-500"
                        />
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium mb-2">
                          Options <span className="text-red-500">*</span>
                        </label>

                        <div className="space-y-2">
                          {questions[currentQuestionIndex].options.map(
                            (option) => (
                              <div
                                key={option.id}
                                className="flex items-center space-x-2"
                              >
                                <input
                                  type="radio"
                                  name={`correct-${questions[currentQuestionIndex].id}`}
                                  checked={option.isCorrect}
                                  onChange={() =>
                                    setCorrectOption(
                                      questions[currentQuestionIndex].id,
                                      option.id
                                    )
                                  }
                                  className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                                />
                                <input
                                  type="text"
                                  value={option.text}
                                  onChange={(e) =>
                                    updateOptionText(
                                      questions[currentQuestionIndex].id,
                                      option.id,
                                      e.target.value
                                    )
                                  }
                                  className="flex-1 px-4 py-2 border rounded-md focus:ring-2 focus:ring-purple-500"
                                  placeholder="Enter option"
                                  required
                                />
                                {questions[currentQuestionIndex].options
                                  .length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeOption(
                                        questions[currentQuestionIndex].id,
                                        option.id
                                      )
                                    }
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            )
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            addOption(questions[currentQuestionIndex].id)
                          }
                          className="mt-2 text-sm text-purple-600 hover:text-purple-800"
                        >
                          + Add Option
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-400"
            >
              {isLoading
                ? "Saving..."
                : mode === "create"
                ? "Create Quiz"
                : "Update Quiz"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
