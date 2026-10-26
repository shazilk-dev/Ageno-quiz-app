import type { QuestionCounts } from "@/lib/exam/types";
import { publicQuizFromDTO, type PublicQuiz, type PublicQuizDTO } from "@/lib/quiz-data";
import type { MyAttemptDTO } from "@/lib/server/history";
import type { LeaderboardDTO } from "@/lib/server/leaderboard";

// What a player's screens show, and how the server's plain-JSON versions (DTOs: dates as epoch ms) turn
// into it. The same helpers serve data fetched by the browser (`lib/quizzes-api.ts`) and data a page was
// rendered with on the server, so both paths end up identical. No network code here.

/** A lobby's data as the server sends it. */
export interface QuizInfoDTO {
  quiz: PublicQuizDTO;
  active: boolean;
  counts: QuestionCounts;
}

export interface QuizInfo {
  quiz: PublicQuiz;
  /** False when the quiz has been switched off. */
  active: boolean;
  counts: QuestionCounts;
}

export const quizInfoFromDTO = (info: QuizInfoDTO): QuizInfo => ({
  ...info,
  quiz: publicQuizFromDTO(info.quiz),
});

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

export const leaderboardFromDTO = (data: LeaderboardDTO): Leaderboard => ({
  ...data,
  rows: data.rows.map((row) => ({
    ...row,
    startedAt: row.startedAt === null ? null : new Date(row.startedAt),
    submittedAt: row.submittedAt === null ? null : new Date(row.submittedAt),
  })),
});

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
  hasResult: boolean;
}

export const myAttemptFromDTO = (attempt: MyAttemptDTO): MyAttempt => ({
  ...attempt,
  startedAt: new Date(attempt.startedAt),
  submittedAt: new Date(attempt.submittedAt),
});
