"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Quiz } from "@/firebase/firestore";
import { saveProgress, submitAttempt } from "@/lib/exam/api";
import {
  type AnswerMap,
  type FlagMap,
  summarize,
} from "@/lib/exam/answers";
import { attemptKey, clearAttempt, saveAttempt } from "@/lib/exam/storage";
import type { AttemptSeed, SubmitResult } from "@/lib/exam/types";

export type { AttemptSeed } from "@/lib/exam/types";

export type AttemptStatus = "taking" | "submitting" | "error" | "submitted";

/** How long after the last change the server hears about it. */
const SERVER_SAVE_DELAY_MS = 2000;

interface State {
  index: number;
  answers: AnswerMap;
  flagged: FlagMap;
}

type Action =
  | { type: "select"; questionId: string; option: number | null }
  | { type: "flag"; questionId: string }
  | { type: "goto"; index: number };

function init(seed: AttemptSeed): State {
  const { questions, progress } = seed;
  const answers: AnswerMap = {};
  const flagged: FlagMap = {};
  for (const question of questions) {
    answers[question.id] = progress?.answers[question.id] ?? null;
    if (progress?.flagged[question.id]) flagged[question.id] = true;
  }
  const index = Math.min(
    Math.max(0, Math.trunc(progress?.index ?? 0)),
    Math.max(0, questions.length - 1)
  );
  return { index, answers, flagged };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "select":
      return {
        ...state,
        answers: { ...state.answers, [action.questionId]: action.option },
      };
    case "flag": {
      const flagged = { ...state.flagged };
      if (flagged[action.questionId]) delete flagged[action.questionId];
      else flagged[action.questionId] = true;
      return { ...state, flagged };
    }
    case "goto":
      return { ...state, index: action.index };
  }
}

/**
 * State for one exam attempt: answers, flags, position, the deadline, tab switches, autosave and the
 * submit. The clock, the questions and the scoring all belong to the server; this holds what the person
 * has done so far. Mount it with a `key` per attempt: a retry then starts from clean state by construction.
 */
export function useQuizAttempt(
  quiz: Quiz,
  seed: AttemptSeed,
  userId: string | null
) {
  const { questions, attemptId, startedAt, durationSec, difficulty } = seed;
  const storageKey = attemptKey(quiz.id, userId);
  const deadline = startedAt + durationSec * 1000;

  const [state, dispatch] = useReducer(reducer, seed, init);
  const [tabSwitches, setTabSwitches] = useState(seed.progress?.tabSwitches ?? 0);
  const [fullscreenExits, setFullscreenExits] = useState(
    seed.progress?.fullscreenExits ?? 0
  );
  const [status, setStatus] = useState<AttemptStatus>("taking");
  const [timedOut, setTimedOut] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Set synchronously, so a double click or the timer firing mid-submit can't start a second one.
  const submittingRef = useRef(false);

  const summary = useMemo(
    () => summarize(questions, state.answers, state.flagged),
    [questions, state.answers, state.flagged]
  );

  const submit = useCallback(
    async (reason: "manual" | "timeout") => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      if (reason === "timeout") setTimedOut(true);
      setStatus("submitting");
      setErrorMessage(null);

      try {
        const response = await submitAttempt(attemptId, {
          answers: state.answers,
          tabSwitches,
          fullscreenExits,
        });
        clearAttempt(storageKey);
        setResult(response);
        setStatus("submitted");
        // The guard stays set: a finished attempt can't be submitted again.
      } catch (error) {
        console.error("Error submitting quiz:", error);
        submittingRef.current = false;
        setErrorMessage(error instanceof Error ? error.message : null);
        setStatus("error");
      }
    },
    [attemptId, state.answers, tabSwitches, fullscreenExits, storageKey]
  );

  // Autosave to this device on every change. The first run also saves the start time, so even an
  // attempt with no answers yet can be resumed with the clock still running.
  useEffect(() => {
    if (status === "submitted") return;
    saveAttempt(storageKey, {
      version: 1,
      attemptId,
      quizId: quiz.id,
      difficulty,
      startedAt,
      durationSec,
      questionIds: questions.map((question) => question.id),
      answers: state.answers,
      flagged: state.flagged,
      index: state.index,
      tabSwitches,
      fullscreenExits,
      savedAt: Date.now(),
    });
  }, [
    status,
    storageKey,
    attemptId,
    quiz.id,
    difficulty,
    startedAt,
    durationSec,
    questions,
    state,
    tabSwitches,
    fullscreenExits,
  ]);

  // ...and to the server a moment after the last change. A fresh attempt starts in sync with it; a
  // resumed one has nothing recorded as sent, so what this device holds is sent once.
  const lastSent = useRef<string | null>(
    seed.progress
      ? null
      : JSON.stringify({
          answers: init(seed).answers,
          flagged: {},
          index: 0,
          tabSwitches: 0,
          fullscreenExits: 0,
        })
  );
  useEffect(() => {
    if (status !== "taking") return;
    const patch = {
      answers: state.answers,
      flagged: state.flagged,
      index: state.index,
      tabSwitches,
      fullscreenExits,
    };
    const serialized = JSON.stringify(patch);
    if (serialized === lastSent.current) return;

    const timer = setTimeout(() => {
      lastSent.current = serialized;
      saveProgress(attemptId, patch).catch((error) => {
        // Not fatal: the submit sends everything again. Forget it so the next change retries.
        lastSent.current = null;
        console.error("Autosave to the server failed:", error);
      });
    }, SERVER_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, attemptId, state, tabSwitches, fullscreenExits]);

  // Leaving the tab is recorded (as timestamped events on the server in P5.9).
  useEffect(() => {
    if (status !== "taking") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setTabSwitches((count) => count + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [status]);

  // Closing or reloading mid-attempt asks first. The autosave means a reload is recoverable.
  useEffect(() => {
    if (status === "submitted") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= questions.length) return;
      dispatch({ type: "goto", index });
    },
    [questions.length]
  );

  const question = questions[state.index];

  return {
    questions,
    question,
    index: state.index,
    answers: state.answers,
    flagged: state.flagged,
    summary,
    deadline,
    durationSec,
    tabSwitches,
    fullscreenExits,
    status,
    timedOut,
    result,
    errorMessage,
    goTo,
    next: () => goTo(state.index + 1),
    previous: () => goTo(state.index - 1),
    select: (option: number | null) =>
      dispatch({ type: "select", questionId: question.id, option }),
    toggleFlag: () => dispatch({ type: "flag", questionId: question.id }),
    submit,
    /** Count one exit from fullscreen (strict exams). Ignored once the attempt is over. */
    recordFullscreenExit: () => {
      if (status === "taking") setFullscreenExits((count) => count + 1);
    },
    /** Close a failed submit and go back to the questions (not offered once time has run out). */
    dismissError: () => setStatus("taking"),
  };
}

export type QuizAttemptApi = ReturnType<typeof useQuizAttempt>;
