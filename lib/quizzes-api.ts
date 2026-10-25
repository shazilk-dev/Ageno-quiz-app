import { apiRequest } from "@/lib/api-client";
import type { QuestionCounts } from "@/lib/exam/types";
import {
  publicQuizFromDTO,
  type PublicQuiz,
  type PublicQuizDTO,
} from "@/lib/quiz-data";

/** Everything a player's browser may ask the server about quizzes, attempts history and rankings. */

export interface QuizInfo {
  quiz: PublicQuiz;
  /** False when the quiz has been switched off. */
  active: boolean;
  counts: QuestionCounts;
}

export async function fetchQuizzes(): Promise<PublicQuiz[]> {
  const { quizzes } = await apiRequest<{ quizzes: PublicQuizDTO[] }>("/api/quizzes", {
    auth: false,
  });
  return quizzes.map(publicQuizFromDTO);
}

export async function fetchQuiz(quizId: string): Promise<QuizInfo> {
  const info = await apiRequest<{
    quiz: PublicQuizDTO;
    active: boolean;
    counts: QuestionCounts;
  }>(`/api/quizzes/${encodeURIComponent(quizId)}`, { auth: false });
  return { ...info, quiz: publicQuizFromDTO(info.quiz) };
}

/** Access code -> quiz id. Rejects with a 404 `ApiRequestError` when no quiz has that code. */
export async function resolveAccessCode(code: string): Promise<string> {
  const { quizId } = await apiRequest<{ quizId: string }>("/api/quizzes/resolve", {
    method: "POST",
    body: { code },
    auth: false,
  });
  return quizId;
}

export interface LeaderboardRow {
  id: string;
  userId: string;
  quizId: string;
  score: number | null;
  selectedDifficulty: string;
  startedAt: Date | null;
  submittedAt: Date | null;
}

export interface Leaderboard {
  rows: LeaderboardRow[];
  users: Record<string, string>;
  quizzes: Record<string, string>;
}

export async function fetchLeaderboard(filters: {
  timeFrame: "all" | "week" | "month";
  quizId?: string;
  difficulty?: string;
}): Promise<Leaderboard> {
  const params = new URLSearchParams({ timeFrame: filters.timeFrame });
  if (filters.quizId) params.set("quizId", filters.quizId);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);

  const data = await apiRequest<{
    rows: (Omit<LeaderboardRow, "startedAt" | "submittedAt"> & {
      startedAt: number | null;
      submittedAt: number | null;
    })[];
    users: Record<string, string>;
    quizzes: Record<string, string>;
  }>(`/api/leaderboard?${params}`);

  return {
    ...data,
    rows: data.rows.map((row) => ({
      ...row,
      startedAt: row.startedAt === null ? null : new Date(row.startedAt),
      submittedAt: row.submittedAt === null ? null : new Date(row.submittedAt),
    })),
  };
}

export interface MyAttempt {
  id: string;
  quizId: string;
  quizTitle: string;
  quizDescription: string;
  startedAt: Date;
  submittedAt: Date;
  score: number | null;
  tabSwitchCount: number;
  fullscreenExits: number;
  selectedDifficulty: string;
}

export async function fetchMyAttempts(): Promise<MyAttempt[]> {
  const { attempts } = await apiRequest<{
    attempts: (Omit<MyAttempt, "startedAt" | "submittedAt"> & {
      startedAt: number;
      submittedAt: number;
    })[];
  }>("/api/my-attempts");
  return attempts.map((attempt) => ({
    ...attempt,
    startedAt: new Date(attempt.startedAt),
    submittedAt: new Date(attempt.submittedAt),
  }));
}
