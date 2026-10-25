import type { Quiz } from "@/firebase/firestore";

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
