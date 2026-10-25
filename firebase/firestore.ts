/* eslint-disable @typescript-eslint/no-unused-vars */
// firebase/firestore.ts
import { quizFromData } from "@/lib/quiz-data";
import { db, auth } from "./client";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  DocumentData,
  QueryDocumentSnapshot,
  DocumentSnapshot,
  Timestamp,
  setDoc,
  orderBy,
  FieldValue,
  // limit,
  //   collectionGroup,
} from "firebase/firestore";

// Firebase timestamp type alias for better readability
export type FirebaseTimestamp = FieldValue;

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

export interface QuizAttempt {
  id: string;
  quizId: string;
  quizTitle?: string;
  quizDescription?: string;
  startedAt: Date;
  submittedAt: Date;
  score: number | null;
  tabSwitchCount: number;
  cameraFlags: string[];
  selectedDifficulty?: string; // "easy", "medium", or "hard"
  answers?: {
    questionId: string;
    selectedIndex: number;
    isCorrect: boolean | null;
  }[];
}

/**
 * Convert Firestore document to Quiz object
 */
export const quizConverter = {
  fromFirestore(snapshot: QueryDocumentSnapshot | DocumentSnapshot): Quiz {
    const data = snapshot.data() as DocumentData;
    return quizFromData(
      snapshot.id,
      data,
      data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date()
    );
  },
};

/**
 * Convert Firestore document to QuizAttempt object
 */
export const quizAttemptConverter = {
  fromFirestore(
    snapshot: QueryDocumentSnapshot | DocumentSnapshot
  ): QuizAttempt {
    const data = snapshot.data() as DocumentData;
    return {
      id: snapshot.id,
      quizId: data.quizId || "",
      startedAt:
        data.startedAt instanceof Timestamp
          ? data.startedAt.toDate()
          : new Date(),
      submittedAt:
        data.submittedAt instanceof Timestamp
          ? data.submittedAt.toDate()
          : new Date(),
      score: data.score,
      tabSwitchCount: data.tabSwitchCount || 0,
      cameraFlags: data.cameraFlags || [],
      selectedDifficulty: data.selectedDifficulty || "medium", // Default to medium
    };
  },
};

/**
 * Check if the user is authenticated
 * This is a utility function to log authentication state for debugging
 */
function logAuthState() {
  const user = auth.currentUser;
  if (user) {
  } else {
  }
}

/**
 * Fetch all active quizzes
 */
export async function getActiveQuizzes(): Promise<Quiz[]> {
  // Errors propagate so the caller can show a real error state with Retry
  // instead of an empty list that looks like "no quizzes".
  const quizzesRef = collection(db, "quizzes");
  const querySnapshot = await getDocs(quizzesRef);

  return querySnapshot.docs.map((doc) => quizConverter.fromFirestore(doc));
}

/**
 * Fetch a single quiz by ID. The quiz document only: the questions (and their answers) are never read
 * from the browser; an attempt gets them from the server (`lib/exam/api.ts`).
 */
export async function getQuizById(quizId: string): Promise<Quiz | null> {
  try {
    const quizSnapshot = await getDoc(doc(db, "quizzes", quizId));
    if (!quizSnapshot.exists()) return null;
    return quizConverter.fromFirestore(quizSnapshot);
  } catch (error) {
    console.error(`Error fetching quiz with ID ${quizId}:`, error);
    return null;
  }
}

/**
 * Fetch a quiz by access code (the quiz document only, see `getQuizById`).
 */
export async function getQuizByCode(code: string): Promise<Quiz | null> {
  try {
    const q = query(collection(db, "quizzes"), where("accessCode", "==", code));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;

    const quiz = quizConverter.fromFirestore(querySnapshot.docs[0]);

    // Don't allow joining if quiz requires access code but doesn't match
    if (quiz.requiresAccessCode === true) {
      if (!code || code.trim() !== quiz.accessCode.trim()) return null;
    }
    return quiz;
  } catch (error) {
    console.error(`Error fetching quiz with code ${code}:`, error);
    return null;
  }
}

/**
 * Fetch user's quiz attempts
 */
export async function getUserQuizAttempts(manualUserId?: string): Promise<QuizAttempt[]> {
  try {
    // Log authentication state for debugging
    logAuthState();

    // Get current user ID - either from the parameter or from Firebase Auth
    const userId = manualUserId || auth.currentUser?.uid;
    if (!userId) {
      console.error("Cannot fetch attempts: No authenticated user");
      return [];
    }


    // CRITICAL DEBUGGING: Print out a list of all responses regardless of userId
    // to see if there are any responses at all
    try {
      const allResponsesRef = collection(db, "responses");
      const allResponses = await getDocs(allResponsesRef);
    } catch (err) {
      console.error("Error in debug query:", err);
    }

    // Query responses collection for user's attempts
    const responsesRef = collection(db, "responses");
    const q = query(
      responsesRef,
      where("userId", "==", userId),
      orderBy("submittedAt", "desc")
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.size === 0) {

      // Try a more permissive query to see if the userId might be stored differently
      // For example, some systems might store UIDs as strings vs objects or with different casing
      const looseQuery = query(responsesRef, orderBy("submittedAt", "desc"));

      const looseResults = await getDocs(looseQuery);
    } else {
    }

    // Convert snapshots to QuizAttempt objects
    const attempts: QuizAttempt[] = [];

    for (const docSnapshot of querySnapshot.docs) {
      try {
        const docData = docSnapshot.data();

        const attempt = quizAttemptConverter.fromFirestore(docSnapshot);

        // Get the associated quiz details
        if (attempt.quizId) {
          const quiz = await getQuizById(attempt.quizId);
          if (quiz) {
            attempt.quizTitle = quiz.title;
            attempt.quizDescription = quiz.description;
          } else {
            attempt.quizTitle = "Unknown Quiz"; // Fallback title
          }
        } else {
          attempt.quizTitle = "Unknown Quiz"; // Fallback title
        }

        // Get the answers subcollection
        try {
          const answersRef = collection(
            db,
            "responses",
            docSnapshot.id,
            "answers"
          );
          const answersSnapshot = await getDocs(answersRef);

          attempt.answers = answersSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              questionId: data.questionId || "",
              selectedIndex: data.selectedIndex || 0,
              isCorrect: data.isCorrect,
            };
          });
        } catch (err) {
          console.error(
            `Error fetching answers for attempt ${docSnapshot.id}:`,
            err
          );
          attempt.answers = []; // Provide empty answers array as fallback
        }

        attempts.push(attempt);
      } catch (err) {
        console.error(`Error processing attempt ${docSnapshot.id}:`, err);
        // Continue to the next attempt instead of failing the whole function
      }
    }

    return attempts;
  } catch (error) {
    console.error("Error fetching user quiz attempts:", error);
    // Check if it's a permission error
    if (error instanceof Error && error.toString().includes("permission")) {
      console.error(
        "Permission denied. Please check Firestore rules or authentication state."
      );
    }
    return [];
  }
}
