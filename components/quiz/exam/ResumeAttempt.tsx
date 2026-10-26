"use client";

import { useState } from "react";
import { Alert, Button, Card, Dialog } from "@/components/ui";
import { LobbyFrame } from "@/components/quiz/lobby/LobbyStates";
import { formatClock, isAnswered, secondsUntil } from "@/lib/exam/answers";
import { attemptDeadline, type SavedAttempt } from "@/lib/exam/storage";

interface ResumeAttemptProps {
  title: string;
  saved: SavedAttempt;
  resuming: boolean;
  error: string | null;
  onResume: () => void;
  onDiscard: () => void;
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Shown instead of the lobby when this device holds an unfinished attempt (after a reload or a closed tab). */
export default function ResumeAttempt({
  title,
  saved,
  resuming,
  error,
  onResume,
  onDiscard,
}: ResumeAttemptProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [now] = useState(() => Date.now());

  const remaining = secondsUntil(attemptDeadline(saved), now);
  const answered = Object.values(saved.answers).filter(isAnswered).length;
  const total = saved.questionIds.length;

  return (
    <LobbyFrame>
      <div className="max-w-xl py-6 sm:py-12">
        <p className="text-label">{"// Attempt in progress"}</p>
        <h1 className="mt-2 text-3xl">Pick up where you left off</h1>
        <p className="mt-3 text-text-muted">
          You started {title} and didn&apos;t finish. Your answers were saved on
          this device.
        </p>

        <Card className="mt-6 p-5 sm:p-6">
          <dl className="divide-y divide-border">
            <Fact term="Answered" value={`${answered} of ${total}`} />
            <Fact term="Difficulty" value={capitalise(saved.difficulty)} />
            <Fact
              term="Time left"
              value={remaining > 0 ? formatClock(remaining) : "None"}
            />
          </dl>

          {remaining === 0 && (
            <p className="mt-4 text-sm text-text-body">
              The time ran out while you were away. We&apos;ll submit the
              answers you gave.
            </p>
          )}

          {error && (
            <Alert variant="error" className="mt-4">
              {error}
            </Alert>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={onResume} loading={resuming}>
              {remaining > 0 ? "Resume attempt" : "Submit saved answers"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmingDiscard(true)}
              disabled={resuming}
            >
              Start over
            </Button>
          </div>
        </Card>
      </div>

      <Dialog
        open={confirmingDiscard}
        onClose={() => setConfirmingDiscard(false)}
        title="Start over?"
        description="Your saved answers will be deleted and the clock starts again from the beginning."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingDiscard(false)}>
              Keep my attempt
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingDiscard(false);
                onDiscard();
              }}
            >
              Delete and start over
            </Button>
          </>
        }
      />
    </LobbyFrame>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-sm text-text-muted">{term}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}
