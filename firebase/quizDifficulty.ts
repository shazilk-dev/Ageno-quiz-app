// firebase/quizDifficulty.ts
import {
  collection,
  doc,
  writeBatch,
  getDocs,
  query,
} from "firebase/firestore";
import { db } from "./client";
import { QuizQuestion } from "./firestore";

/**
 * Save questions for a specific quiz by difficulty level
 * @param quizId The ID of the quiz
 * @param difficulty The difficulty level (easy, medium, hard)
 * @param questions Array of questions to save
 */
export async function saveQuestionsByDifficulty(
  quizId: string,
  difficulty: string,
  questions: QuizQuestion[]
): Promise<void> {
  try {
    const questionsCollectionRef = collection(
      db,
      `quizzes/${quizId}/questions_${difficulty}`
    );
    const batch = writeBatch(db);

    // First, delete any existing questions in this difficulty
    const existingDocsQuery = query(questionsCollectionRef);
    const existingDocs = await getDocs(existingDocsQuery);

    existingDocs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Then add all the new questions
    questions.forEach((question) => {
      const newDocRef = doc(questionsCollectionRef);
      batch.set(newDocRef, {
        text: question.text,
        options: question.options,
        points: question.points,
        type: question.type || "single",
        ...(question.imageUrl && { imageUrl: question.imageUrl }),
      });
    });

    await batch.commit();
  } catch (error) {
    console.error(
      `Error saving questions for difficulty ${difficulty}:`,
      error
    );
    throw error;
  }
}

/**
 * Load questions for a specific quiz and difficulty level
 * @param quizId The ID of the quiz
 * @param difficulty The difficulty level (easy, medium, hard)
 * @returns Array of questions
 */
export async function getQuestionsByDifficulty(
  quizId: string,
  difficulty: string
): Promise<QuizQuestion[]> {
  try {
    const questionsCollectionRef = collection(
      db,
      `quizzes/${quizId}/questions_${difficulty}`
    );
    const querySnapshot = await getDocs(questionsCollectionRef);

    const questions: QuizQuestion[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      questions.push({
        id: doc.id,
        text: data.text || "",
        options: data.options || [],
        points: data.points || 1,
        type: data.type || "single",
        ...(data.imageUrl && { imageUrl: data.imageUrl }),
      });
    });

    return questions;
  } catch (error) {
    console.error(
      `Error loading questions for difficulty ${difficulty}:`,
      error
    );
    throw error;
  }
}

/**
 * Helper function to save all questions for all difficulties
 * @param quizId The ID of the quiz
 * @param questionsByDifficulty Object containing questions grouped by difficulty
 * @param availableDifficulties Array of available difficulties for this quiz
 */
export async function saveAllQuestionsByDifficulty(
  quizId: string,
  questionsByDifficulty: Record<string, QuizQuestion[]>,
  availableDifficulties: string[]
): Promise<void> {
  try {
    // Save each difficulty level in parallel
    const savePromises = availableDifficulties.map((difficulty) =>
      saveQuestionsByDifficulty(
        quizId,
        difficulty,
        questionsByDifficulty[difficulty] || []
      )
    );

    await Promise.all(savePromises);
  } catch (error) {
    console.error("Error saving all questions by difficulty:", error);
    throw error;
  }
}
