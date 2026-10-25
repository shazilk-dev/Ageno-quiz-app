"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QuizAttempt from "@/components/quiz/exam/QuizAttempt";
import ResumeAttempt from "@/components/quiz/exam/ResumeAttempt";
import QuizLobby, { type QuestionsState } from "@/components/quiz/lobby/QuizLobby";
import {
  LobbySkeleton,
  QuizInactive,
  QuizLoadFailed,
  QuizNotFound,
} from "@/components/quiz/lobby/LobbyStates";
import { useAuth } from "@/contexts/auth-context";
import { useQuizLoader } from "@/hooks/useQuizLoader";
import { ApiRequestError, resumeAttempt, startAttempt } from "@/lib/exam/api";
import {
  enterFullscreen,
  exitFullscreen,
  isFullscreenSupported,
} from "@/lib/exam/fullscreen";
import { forgetCode, getRememberedCode, rememberCode } from "@/lib/quiz-access";
import { seedFromServer } from "@/lib/exam/seed";
import {
  attemptKey,
  clearAttempt,
  loadAttempt,
  type SavedAttempt,
} from "@/lib/exam/storage";
import type { AttemptSeed } from "@/lib/exam/types";

interface ClientProps {
  quizId: string;
}

const QUESTIONS_FAILED =
  "We couldn't load this quiz. Check your connection and try again.";
const FULLSCREEN_DENIED =
  "Your browser didn't allow fullscreen, which this quiz needs. Allow it for this site (the icon at the left of the address bar) and press Start again. The F11 key isn't enough.";
const ATTEMPT_ENDED =
  "That attempt has already ended, so there's nothing to resume. You can start a new one.";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Try again.";

const isCodeError = (error: unknown): error is ApiRequestError =>
  error instanceof ApiRequestError &&
  (error.code === "access_code_invalid" || error.code === "access_code_required");

/**
 * Wires the quiz route together: load the quiz, show the lobby (or "resume your attempt" when this
 * device holds an unfinished one), run the attempt, show the results. The exam itself lives in
 * `components/quiz/exam/` and `hooks/useQuizAttempt.ts`; the quiz, the questions, the access-code check,
 * the clock and the scoring all come from the server (`lib/quizzes-api.ts`, `lib/exam/api.ts`).
 */
export default function QuizClient({ quizId }: ClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid ?? null;
  const loader = useQuizLoader(quizId);
  const { quiz } = loader;

  // `userId` is a snapshot from when the attempt began, so its autosave key can't change mid-exam.
  const [attempt, setAttempt] = useState<{
    seed: AttemptSeed;
    userId: string | null;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Look for an unfinished attempt once the quiz (and who is signed in) is known.
  const storageKey = quiz ? attemptKey(quiz.id, userId) : null;
  const [savedCheck, setSavedCheck] = useState<{
    key: string;
    saved: SavedAttempt | null;
  } | null>(null);
  useEffect(() => {
    setSavedCheck(
      storageKey ? { key: storageKey, saved: loadAttempt(storageKey) } : null
    );
  }, [storageKey]);

  if (loader.status === "loading") return <LobbySkeleton />;
  if (loader.status === "error") {
    return <QuizLoadFailed onRetry={loader.reload} />;
  }
  if (loader.status === "notFound" || !quiz || !storageKey) {
    return <QuizNotFound />;
  }
  if (!loader.active) return <QuizInactive title={quiz.title} />;

  const begin = (seed: AttemptSeed) => setAttempt({ seed, userId });
  const strict = quiz.examMode === "strict";

  if (attempt) {
    return (
      <QuizAttempt
        key={attempt.seed.attemptId}
        quiz={quiz}
        seed={attempt.seed}
        userId={attempt.userId}
        onRetry={async () => {
          // From the click, before anything else: browsers only allow fullscreen from a user gesture.
          const fullscreen = enterFullscreen();
          try {
            const state = await startAttempt(
              quiz.id,
              attempt.seed.difficulty,
              getRememberedCode(quiz.id) ?? undefined
            );
            await fullscreen;
            begin(seedFromServer(state));
          } catch (error) {
            await fullscreen;
            void exitFullscreen();
            throw new Error(messageOf(error));
          }
        }}
        onExit={() => router.push("/join")}
      />
    );
  }

  if (savedCheck?.key !== storageKey) return <LobbySkeleton />;

  const saved = savedCheck.saved;
  if (saved && user) {
    const handleResume = async () => {
      setResuming(true);
      setResumeError(null);
      // A strict exam shows its "return to fullscreen" screen if this is refused, so no need to wait on it.
      const fullscreen = enterFullscreen();
      try {
        const state = await resumeAttempt(saved.attemptId);
        begin(seedFromServer(state, { local: saved, resume: true }));
      } catch (error) {
        await fullscreen;
        void exitFullscreen();
        if (
          error instanceof ApiRequestError &&
          (error.status === 404 || error.code === "attempt_closed")
        ) {
          // Gone, or finished somewhere else (or saved by an older version of the app): drop the copy here.
          clearAttempt(storageKey);
          setSavedCheck({ key: storageKey, saved: null });
          setStartError(ATTEMPT_ENDED);
        } else {
          setResumeError(messageOf(error));
        }
      } finally {
        setResuming(false);
      }
    };

    return (
      <ResumeAttempt
        title={quiz.title}
        saved={saved}
        resuming={resuming}
        error={resumeError}
        onResume={handleResume}
        onDiscard={() => {
          clearAttempt(storageKey);
          setResumeError(null);
          setSavedCheck({ key: storageKey, saved: null });
        }}
      />
    );
  }

  const handleStart = async (typedCode?: string) => {
    if (starting || !user) return;
    setStarting(true);
    setStartError(null);
    setCodeError(null);
    const code = typedCode ?? getRememberedCode(quiz.id) ?? undefined;

    // First thing, straight from the click: browsers only allow fullscreen from a user gesture.
    const entered = await enterFullscreen();

    // A strict quiz doesn't start (and its clock doesn't) until the browser has gone fullscreen.
    if (strict && !entered) {
      setStarting(false);
      setStartError(FULLSCREEN_DENIED);
      return;
    }

    try {
      const state = await startAttempt(quiz.id, loader.difficulty, code);
      if (code) rememberCode(quiz.id, code);
      begin(seedFromServer(state));
    } catch (error) {
      void exitFullscreen();
      if (isCodeError(error)) {
        // The server decides whether a code is right. Ask again.
        forgetCode(quiz.id);
        setCodeError(error.message);
      } else {
        setStartError(messageOf(error));
      }
    } finally {
      setStarting(false);
    }
  };

  const questionsState: QuestionsState =
    loader.questionsStatus === "loading"
      ? "loading"
      : loader.questionsStatus === "ready"
        ? "ready"
        : "empty";

  return (
    <QuizLobby
      quiz={quiz}
      questionCount={loader.questionCount}
      difficulties={quiz.availableDifficulties}
      selectedDifficulty={loader.difficulty}
      onSelectDifficulty={(level) => {
        setStartError(null);
        loader.selectDifficulty(level);
      }}
      questionsState={questionsState}
      starting={starting}
      startError={
        startError ??
        (loader.questionsStatus === "error" ? QUESTIONS_FAILED : null)
      }
      hasRememberedCode={getRememberedCode(quiz.id) !== null}
      codeError={codeError}
      onRetryQuestions={() => {
        setStartError(null);
        loader.reload();
      }}
      signedIn={authLoading ? null : !!user}
      onStart={handleStart}
      fullscreenBlocked={strict && !isFullscreenSupported()}
    />
  );
}
