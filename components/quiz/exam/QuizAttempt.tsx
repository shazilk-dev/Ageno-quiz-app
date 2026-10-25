"use client";

import { useEffect, useState } from "react";
import type { Quiz } from "@/firebase/firestore";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useQuizAttempt, type AttemptSeed } from "@/hooks/useQuizAttempt";
import { exitFullscreen, isFullscreenSupported } from "@/lib/exam/fullscreen";
import { useExamMode } from "@/components/layout/QuizFrame";
import ExamShell from "./ExamShell";
import FullscreenGate from "./FullscreenGate";
import FullscreenNotice from "./FullscreenNotice";
import ResultsView from "./ResultsView";
import SubmitDialog from "./SubmitDialog";

interface QuizAttemptProps {
  quiz: Quiz;
  seed: AttemptSeed;
  userId: string | null;
  /** Starts a new attempt. Rejects with a message for the person if it can't. */
  onRetry: () => Promise<void>;
  onExit: () => void;
}

/**
 * One attempt from the first question to the results. Mount it with `key={seed.attemptId}`, so a retry
 * gets fresh answers, flags and tab-switch count with no reset code.
 */
export default function QuizAttempt({
  quiz,
  seed,
  userId,
  onRetry,
  onExit,
}: QuizAttemptProps) {
  const attempt = useQuizAttempt(quiz, seed, userId);
  const [confirming, setConfirming] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const finished = attempt.status === "submitted";

  // Strict exams count every exit from fullscreen; practice ones only offer a way back.
  const strict = quiz.examMode === "strict";
  const fullscreen = useFullscreen(() => {
    if (strict) attempt.recordFullscreenExit();
  });
  const canFullscreen = isFullscreenSupported();

  // Back to a normal window for the results.
  useEffect(() => {
    if (finished) void exitFullscreen();
  }, [finished]);

  // The site header is out of the way until the results.
  useExamMode(!finished);

  if (finished) {
    return (
      <ResultsView
        quiz={quiz}
        attempt={attempt}
        difficulty={seed.difficulty}
        signedIn={!!userId}
        onRetry={onRetry}
        onExit={onExit}
      />
    );
  }

  // Strict: outside fullscreen the questions are replaced, not just covered. The clock keeps running.
  if (strict && canFullscreen && !fullscreen.active && attempt.status === "taking") {
    return (
      <FullscreenGate
        title={quiz.title}
        deadline={attempt.deadline}
        durationSec={attempt.durationSec}
        onExpire={() => void attempt.submit("timeout")}
        exits={attempt.fullscreenExits}
        onReturn={fullscreen.enter}
      />
    );
  }

  const dialogOpen = confirming || attempt.status !== "taking";
  const showNotice =
    !strict && canFullscreen && !fullscreen.active && !noticeDismissed;

  return (
    <>
      <ExamShell
        title={quiz.title}
        attempt={attempt}
        dialogOpen={dialogOpen}
        onRequestSubmit={() => setConfirming(true)}
        notice={
          showNotice && (
            <FullscreenNotice
              onReturn={() => void fullscreen.enter()}
              onDismiss={() => setNoticeDismissed(true)}
            />
          )
        }
      />
      <SubmitDialog
        confirming={confirming}
        status={attempt.status}
        timedOut={attempt.timedOut}
        summary={attempt.summary}
        errorMessage={attempt.errorMessage}
        onCancel={() => setConfirming(false)}
        onDismissError={() => {
          setConfirming(false);
          attempt.dismissError();
        }}
        onSubmit={() => void attempt.submit("manual")}
        onReviewUnanswered={() => {
          setConfirming(false);
          attempt.goTo(attempt.summary.unansweredIndexes[0] ?? attempt.index);
        }}
      />
    </>
  );
}
