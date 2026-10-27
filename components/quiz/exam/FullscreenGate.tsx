"use client";

import { useState } from "react";
import { Container } from "@/components/layout/Container";
import { Alert, Button, Card } from "@/components/ui";
import ExamTimer from "./ExamTimer";

interface FullscreenGateProps {
  title: string;
  deadline: number;
  durationSec: number;
  /** The clock keeps running behind the gate, and still submits at zero. */
  onExpire: () => void;
  /** How many times the person has left fullscreen so far. */
  exits: number;
  /** Ask the browser for fullscreen again. Must run from the button click. */
  onReturn: () => Promise<boolean>;
}

/**
 * Strict exams only. Replaces the questions (not just dims them) while the page isn't fullscreen, so
 * nothing can be read or answered outside it. The timer stays visible and keeps counting.
 */
export default function FullscreenGate({
  title,
  deadline,
  durationSec,
  onExpire,
  exits,
  onReturn,
}: FullscreenGateProps) {
  const [refused, setRefused] = useState(false);
  const [working, setWorking] = useState(false);

  const handleReturn = async () => {
    setWorking(true);
    setRefused(false);
    const ok = await onReturn();
    setWorking(false);
    if (!ok) setRefused(true);
  };

  return (
    <div
      className="flex min-h-dvh flex-1 flex-col bg-bg text-text"
    >
      <div className="border-b border-border bg-bg-alt">
        <Container className="flex h-14 items-center gap-4">
          <p className="min-w-0 flex-1 truncate font-medium">{title}</p>
          <ExamTimer
            deadline={deadline}
            totalSeconds={durationSec}
            onExpire={onExpire}
          />
        </Container>
      </div>

      <Container className="flex flex-1 items-center py-8">
        <Card className="mx-auto w-full max-w-lg p-6 sm:p-8">
          <p className="text-label">{"// Fullscreen required"}</p>
          <h1 className="mt-2 text-3xl">Return to fullscreen to continue</h1>
          <p className="mt-3 text-text-body">
            This exam has to be taken in fullscreen. Your questions are hidden
            until you&apos;re back, and your timer is still running.
          </p>
          <p className="mt-2 text-sm text-text-muted">
            Leaving fullscreen is recorded for the quiz owner. So far:{" "}
            <span className="font-mono tabular-nums">{exits}</span>.
          </p>

          {refused && (
            <Alert variant="error" className="mt-4">
              Your browser didn&apos;t allow fullscreen. Allow it for this site
              (the icon at the left of the address bar), then try again. The
              F11 key isn&apos;t enough.
            </Alert>
          )}

          <Button
            autoFocus
            size="lg"
            className="mt-6 w-full"
            loading={working}
            onClick={handleReturn}
          >
            Return to fullscreen
          </Button>
        </Card>
      </Container>
    </div>
  );
}
