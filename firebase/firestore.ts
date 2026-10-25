// Shared types for quizzes and their questions. Types only: nothing here runs, so the server can import
// it without loading the browser Firebase SDK. Reading and writing quizzes happens in the admin screens
// (client SDK, admin only) and in the server routes under `lib/server/`.

/** A Firestore server timestamp placeholder, or a stored date. */
export type FirebaseTimestamp = { isEqual(other: unknown): boolean };

// Quiz type definition based on the provided schema
export interface Quiz {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  createdAt: Date | FirebaseTimestamp;
  updatedAt?: Date | FirebaseTimestamp;
  duration: number; // in minutes (default duration for backward compatibility)
  isAutoCheck: boolean;
  accessCode: string;
  requiresAccessCode?: boolean; // Flag to indicate if access code is required
  active?: boolean; // false when an admin has switched the quiz off
  /** "practice": fullscreen is offered and leaving it is only a hint. "strict": leaving it blocks the exam and is recorded. Missing = practice. */
  examMode?: "practice" | "strict";
  showAnswerReview?: boolean; // false hides the per-question review on the results screen (missing = shown)
  questions?: QuizQuestion[];
  difficulty?: "easy" | "medium" | "hard"; // Main difficulty level for the quiz
  // New fields for advanced difficulty levels
  availableDifficulties?: string[]; // ["easy", "medium", "hard"]
  // Settings for each difficulty level
  difficultySettings?: {
    easy?: {
      duration: number;
      pointsMultiplier: number;
    };
    medium?: {
      duration: number;
      pointsMultiplier: number;
    };
    hard?: {
      duration: number;
      pointsMultiplier: number;
    };
  };
  // Counts of questions by difficulty level
  questionCountByDifficulty?: {
    easy?: number;
    medium?: number;
    hard?: number;
    [key: string]: number | undefined;
  };
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
  points: number;
  type?: "single" | "multiple" | "truefalse" | string;
  correctIndex?: number; // Added for backward compatibility
  imageUrl?: string; // Added to support image questions
  explanation?: string; // Optional note shown in the results review
}

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

// Quiz submission interface
export interface QuizSubmission {
  id: string;
  quizId: string;
  userId: string;
  answers: Record<string, string[]>; // questionId -> selected option ids
  startedAt: Date;
  completedAt: Date;
  createdAt: Date | FirebaseTimestamp;
  score: number | null;
  maxScore?: number;
  percentage?: number;
  gradedAt?: Date | FirebaseTimestamp | null;
}
