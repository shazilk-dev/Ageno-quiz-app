import type { Quiz } from "@/firebase/firestore";

/**
 * A quiz as a player is allowed to see it. Deliberately has no access code, no owner and no answer
 * settings: those stay on the server.
 */
export interface PublicQuiz {
  id: string;
  title: string;
  description: string;
  /** Default time limit in minutes; a level can override it in `difficultySettings`. */
  duration: number;
  requiresAccessCode: boolean;
  examMode: "practice" | "strict";
  availableDifficulties: string[];
  difficultySettings: Quiz["difficultySettings"];
  createdAt: Date;
}

/** The same thing on the wire (dates as epoch ms). */
export type PublicQuizDTO = Omit<PublicQuiz, "createdAt"> & { createdAt: number };

export function toPublicQuizDTO(
  id: string,
  data: Record<string, unknown>,
  createdAtMs: number
): PublicQuizDTO {
  const quiz = quizFromData(id, data, new Date(createdAtMs));
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    duration: quiz.duration,
    requiresAccessCode: quiz.requiresAccessCode !== false,
    examMode: quiz.examMode ?? "practice",
    availableDifficulties: quiz.availableDifficulties ?? ["easy", "medium", "hard"],
    difficultySettings: quiz.difficultySettings ?? {},
    createdAt: createdAtMs,
  };
}

export const publicQuizFromDTO = (dto: PublicQuizDTO): PublicQuiz => ({
  ...dto,
  createdAt: new Date(dto.createdAt),
});

/**
 * Builds a `Quiz` from a stored document's fields. The browser converter and the server routes both use
 * it, so the defaults for older quizzes (no `active`, no `examMode`, ...) are the same everywhere.
 * Never includes questions.
 */
export function quizFromData(
  id: string,
  data: Record<string, unknown>,
  createdAt: Date
): Quiz {
  return {
    id,
    title: (data.title as string) || "",
    description: (data.description as string) || "",
    createdBy: (data.createdBy as string) || "",
    createdAt,
    duration: (data.duration as number) || 0,
    isAutoCheck: (data.isAutoCheck as boolean) || false,
    accessCode: (data.accessCode as string) || "",
    requiresAccessCode:
      data.requiresAccessCode !== undefined
        ? (data.requiresAccessCode as boolean)
        : true, // Default to true for backwards compatibility
    active: data.active !== false, // Older quizzes have no flag and count as active
    showAnswerReview: data.showAnswerReview !== false, // Only an explicit false hides the review
    examMode: data.examMode === "strict" ? "strict" : "practice",
    availableDifficulties: (data.availableDifficulties as string[]) || [
      "easy",
      "medium",
      "hard",
    ], // Default to all difficulties
    difficultySettings:
      (data.difficultySettings as Quiz["difficultySettings"]) || {},
  };
}
