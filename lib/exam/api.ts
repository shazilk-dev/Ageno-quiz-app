import { auth } from "@/firebase/client";
import type {
  AttemptState,
  ProgressPatch,
  QuestionCounts,
  SubmitResult,
} from "./types";

/** A failed call to the attempt routes. `message` is written for the person taking the quiz. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {};
  // Signed in: the token tells the server who this is. A token that can't be fetched is an error,
  // not a reason to continue as a guest (the attempt would then belong to no account).
  const user = auth.currentUser;
  if (user) {
    try {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    } catch {
      throw new ApiRequestError(401, "invalid_token", "Your sign-in has expired. Sign in again and retry.");
    }
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiRequestError(0, "network", NETWORK_MESSAGE);
  }

  let payload: { error?: string; message?: string } | null = null;
  try {
    payload = await response.json();
  } catch {
    // An empty or non-JSON body is handled below.
  }
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      payload?.error ?? "unknown",
      payload?.message ?? "Something went wrong. Try again."
    );
  }
  return payload as T;
}

const enc = encodeURIComponent;

export const fetchQuestionCounts = async (quizId: string): Promise<QuestionCounts> =>
  (await request<{ counts: QuestionCounts }>(`/api/quizzes/${enc(quizId)}/summary`)).counts;

export const startAttempt = (quizId: string, difficulty: string) =>
  request<AttemptState>("/api/attempts/start", "POST", { quizId, difficulty });

export const resumeAttempt = (attemptId: string) =>
  request<AttemptState>(`/api/attempts/${enc(attemptId)}`);

export const saveProgress = (attemptId: string, patch: ProgressPatch) =>
  request<{ ok: true }>(`/api/attempts/${enc(attemptId)}`, "PATCH", patch);

export const submitAttempt = (attemptId: string, payload: ProgressPatch) =>
  request<SubmitResult>(`/api/attempts/${enc(attemptId)}/submit`, "POST", payload);
