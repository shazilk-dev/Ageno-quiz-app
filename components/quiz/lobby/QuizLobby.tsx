"use client";

import { useMemo } from "react";
import type { PublicQuiz } from "@/lib/quiz-data";
import {
  getDifficultyDuration,
  getDifficultyMultiplier,
} from "@/utils/difficulty-helpers";
import type { DifficultyOption } from "./DifficultyOptions";
import LobbyAbout, { type LobbyFact } from "./LobbyAbout";
import LobbyStartCard from "./LobbyStartCard";
import { LobbyFrame } from "./LobbyStates";

export type QuestionsState = "loading" | "ready" | "empty";

const LEVEL_ORDER = ["easy", "medium", "hard"];

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

interface QuizLobbyProps {
  quiz: PublicQuiz;
  /** Questions in the chosen level (from the server's counts; the questions themselves aren't loaded here). */
  questionCount: number;
  /** Levels this quiz offers, already sorted for display. */
  difficulties: string[];
  selectedDifficulty: string;
  onSelectDifficulty: (difficulty: string) => void;
  /** Whether the chosen level's questions are loading, loaded, or missing. */
  questionsState: QuestionsState;
  starting: boolean;
  startError: string | null;
  /** null while the sign-in state is still resolving. */
  signedIn: boolean | null;
  /** The code typed into the lobby, if it was asked for. */
  onStart: (code?: string) => void;
  /** A code entered earlier this session is on file. */
  hasRememberedCode: boolean;
  /** The server refused the code. */
  codeError: string | null;
  /** Offered next to a load failure, so a dropped connection doesn't need a page reload. */
  onRetryQuestions?: () => void;
  /** A strict quiz on a browser that can't do fullscreen: it can't be started here. */
  fullscreenBlocked?: boolean;
}

/** The pre-quiz screen: about on the left, a sticky start card on the right, stacked on phones. */
export default function QuizLobby({
  quiz,
  questionCount,
  difficulties,
  selectedDifficulty,
  onSelectDifficulty,
  questionsState,
  starting,
  startError,
  signedIn,
  onStart,
  hasRememberedCode,
  codeError,
  onRetryQuestions,
  fullscreenBlocked = false,
}: QuizLobbyProps) {
  const levels = useMemo(
    () =>
      [...difficulties].sort(
        (a, b) =>
          (LEVEL_ORDER.indexOf(a) + 1 || 99) -
          (LEVEL_ORDER.indexOf(b) + 1 || 99)
      ),
    [difficulties]
  );

  const minutes = getDifficultyDuration(quiz, selectedDifficulty);
  const multiplier = getDifficultyMultiplier(quiz, selectedDifficulty);
  const loadingQuestions = questionsState === "loading";

  // Duration and multiplier are shown once, in the facts strip, for the chosen level. The picker only
  // lists what differs between levels, so you can tell them apart without reading everything twice.
  const options = useMemo<DifficultyOption[]>(() => {
    const durations = levels.map((level) => getDifficultyDuration(quiz, level));
    const multipliers = levels.map((level) =>
      getDifficultyMultiplier(quiz, level)
    );
    const durationsDiffer = new Set(durations).size > 1;
    const multipliersDiffer = new Set(multipliers).size > 1;

    return levels.map((level, i) => {
      const detail = [
        durationsDiffer ? `${durations[i]} min` : null,
        multipliersDiffer ? `×${multipliers[i]}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        value: level,
        label: capitalise(level),
        detail: detail || undefined,
      };
    });
  }, [levels, quiz]);

  const anyMultiplier = levels.some(
    (level) => getDifficultyMultiplier(quiz, level) !== 1
  );

  const facts: LobbyFact[] = [
    {
      label: "Questions",
      value: loadingQuestions ? "…" : String(questionsState === "ready" ? questionCount : 0),
    },
    { label: "Time limit", value: `${minutes} min` },
    ...(anyMultiplier ? [{ label: "Points", value: `×${multiplier}` }] : []),
  ];

  return (
    <LobbyFrame>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-12">
        <LobbyAbout
          title={quiz.title}
          description={quiz.description}
          facts={facts}
          examMode={quiz.examMode ?? "practice"}
        />
        <LobbyStartCard
          quizId={quiz.id}
          requiresAccessCode={quiz.requiresAccessCode}
          hasRememberedCode={hasRememberedCode}
          codeError={codeError}
          difficultyOptions={options}
          selectedDifficulty={selectedDifficulty}
          onSelectDifficulty={onSelectDifficulty}
          loadingQuestions={loadingQuestions}
          hasQuestions={questionsState === "ready"}
          starting={starting}
          startError={startError}
          signedIn={signedIn}
          onStart={onStart}
          onRetry={onRetryQuestions}
          fullscreenBlocked={fullscreenBlocked}
        />
      </div>
    </LobbyFrame>
  );
}
