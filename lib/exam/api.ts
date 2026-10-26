import { apiRequest } from "@/lib/api-client";
import type {
  AttemptResult,
  AttemptState,
  ProgressPatch,
  SubmitResult,
} from "./types";

export { ApiRequestError } from "@/lib/api-client";

const enc = encodeURIComponent;

/** Starts an attempt. Needs a signed-in user; a quiz that needs a code also needs `accessCode`. */
export const startAttempt = (
  quizId: string,
  difficulty: string,
  accessCode?: string
) =>
  apiRequest<AttemptState>("/api/attempts/start", {
    method: "POST",
    body: { quizId, difficulty, ...(accessCode ? { accessCode } : {}) },
  });

export const resumeAttempt = (attemptId: string) =>
  apiRequest<AttemptState>(`/api/attempts/${enc(attemptId)}`);

/** A finished attempt's stored result, for the review page under My quizzes. */
export const fetchAttemptResult = (attemptId: string) =>
  apiRequest<AttemptResult>(`/api/attempts/${enc(attemptId)}/result`);

export const saveProgress = (attemptId: string, patch: ProgressPatch) =>
  apiRequest<{ ok: true }>(`/api/attempts/${enc(attemptId)}`, {
    method: "PATCH",
    body: patch,
  });

export const submitAttempt = (attemptId: string, payload: ProgressPatch) =>
  apiRequest<SubmitResult>(`/api/attempts/${enc(attemptId)}/submit`, {
    method: "POST",
    body: payload,
  });
