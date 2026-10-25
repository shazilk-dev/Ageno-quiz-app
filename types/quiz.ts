export type QuizDifficulty = "easy" | "medium" | "hard";

export interface QuizResponse {
  id: string;
  quizId: string;
  userId: string;
  score?: number; // Make score optional to accommodate responses that might not have a score yet
  totalQuestions?: number;
  percentageScore?: number;
  startedAt?: Date | { toDate(): Date } | number;
  submittedAt?: Date | { toDate(): Date } | number;
  timeSpent?: number;
  quizTitle?: string;
  userName?: string;
  tabSwitchCount?: number;
  /** Times the person left fullscreen (strict exams), as recorded by the server. */
  fullscreenExits?: number;
  /** Times the window lost focus during the attempt, as recorded by the server. */
  blurCount?: number;
  difficulty?: QuizDifficulty;
  [key: string]: unknown;
}
