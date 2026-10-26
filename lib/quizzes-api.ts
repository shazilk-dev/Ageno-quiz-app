import { apiRequest } from "@/lib/api-client";
import { leaderboardFromDTO, type Leaderboard, type LeaderboardDTO } from "@/lib/leaderboard";
import {
  myAttemptFromDTO,
  quizInfoFromDTO,
  type MyAttempt,
  type QuizInfo,
  type QuizInfoDTO,
} from "@/lib/player-data";
import { publicQuizFromDTO, type PublicQuiz, type PublicQuizDTO } from "@/lib/quiz-data";
import type { MyAttemptDTO } from "@/lib/server/history";

/**
 * Everything a player's browser may ask the server about quizzes, attempts history and rankings. The shapes
 * (and their DTO converters) are in `lib/player-data.ts` and, for rankings, `lib/leaderboard.ts`, shared
 * with server-rendered pages.
 */
export type { MyAttempt, QuizInfo, QuizInfoDTO } from "@/lib/player-data";
export type { Leaderboard } from "@/lib/leaderboard";

export async function fetchQuizzes(): Promise<PublicQuiz[]> {
  const { quizzes } = await apiRequest<{ quizzes: PublicQuizDTO[] }>("/api/quizzes", {
    auth: false,
  });
  return quizzes.map(publicQuizFromDTO);
}

export async function fetchQuiz(quizId: string): Promise<QuizInfo> {
  return quizInfoFromDTO(
    await apiRequest<QuizInfoDTO>(`/api/quizzes/${encodeURIComponent(quizId)}`, { auth: false })
  );
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

export async function fetchLeaderboard(filters: {
  timeFrame: "all" | "week" | "month";
  quizId?: string;
  difficulty?: string;
}): Promise<Leaderboard> {
  const params = new URLSearchParams({ timeFrame: filters.timeFrame });
  if (filters.quizId) params.set("quizId", filters.quizId);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  return leaderboardFromDTO(await apiRequest<LeaderboardDTO>(`/api/leaderboard?${params}`));
}

export async function fetchMyAttempts(): Promise<MyAttempt[]> {
  const { attempts } = await apiRequest<{ attempts: MyAttemptDTO[] }>("/api/my-attempts");
  return attempts.map(myAttemptFromDTO);
}
