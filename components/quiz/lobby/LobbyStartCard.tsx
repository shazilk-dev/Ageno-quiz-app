"use client";

import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { Alert, Button, Card } from "@/components/ui";
import { codeMatches, isCodeVerified, markCodeVerified } from "@/lib/quiz-access";
import { cn } from "@/lib/utils";
import DifficultyOptions, { type DifficultyOption } from "./DifficultyOptions";

interface LobbyStartCardProps {
  quizId: string;
  /** The quiz's real code. Compared here only until verification moves to the server (P5.4). */
  accessCode: string;
  requiresAccessCode: boolean;
  difficultyOptions: DifficultyOption[];
  selectedDifficulty: string;
  onSelectDifficulty: (value: string) => void;
  /** Questions for the chosen level are still loading. */
  loadingQuestions: boolean;
  /** The chosen level has questions to ask. */
  hasQuestions: boolean;
  starting: boolean;
  startError: string | null;
  signedIn: boolean;
  onStart: () => void;
  /** Shown beside the load error. */
  onRetry?: () => void;
  fullscreenBlocked?: boolean;
}

/**
 * Right column: pick a difficulty, enter the code if the quiz needs one, start. An open quiz starts in
 * one click; a code-protected one in one Enter.
 */
export default function LobbyStartCard({
  quizId,
  accessCode,
  requiresAccessCode,
  difficultyOptions,
  selectedDifficulty,
  onSelectDifficulty,
  loadingQuestions,
  hasQuestions,
  starting,
  startError,
  signedIn,
  onStart,
  onRetry,
  fullscreenBlocked = false,
}: LobbyStartCardProps) {
  const codeId = useId();
  const [verified, setVerified] = useState(
    () => !requiresAccessCode || isCodeVerified(quizId)
  );
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const busy = loadingQuestions || starting;
  const blocked =
    fullscreenBlocked || (!loadingQuestions && !hasQuestions);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || blocked) return;

    if (!verified) {
      if (!code.trim()) {
        setCodeError("Enter the access code you were given.");
        return;
      }
      if (!codeMatches(code, accessCode)) {
        setCodeError("That code doesn't match. Check it and try again.");
        return;
      }
      markCodeVerified(quizId);
      setVerified(true);
    }
    onStart();
  };

  return (
    <Card className="p-5 sm:p-6 lg:sticky lg:top-24">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {difficultyOptions.length > 1 && (
          <DifficultyOptions
            options={difficultyOptions}
            value={selectedDifficulty}
            onChange={onSelectDifficulty}
            disabled={starting}
          />
        )}

        {!verified && (
          <div>
            <label htmlFor={codeId} className="text-label mb-2 block">
              Access code
            </label>
            <input
              id={codeId}
              type="text"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                if (codeError) setCodeError(null);
              }}
              placeholder="Enter access code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? `${codeId}-error` : undefined}
              className={cn(
                "h-12 w-full rounded-md border bg-bg px-4 font-mono text-base text-text uppercase tracking-[0.12em] transition-fast placeholder:font-sans placeholder:text-text-muted/70 placeholder:normal-case placeholder:tracking-normal hover:border-border-strong focus-visible:border-accent",
                codeError ? "border-error" : "border-border"
              )}
            />
            {codeError && (
              <p
                id={`${codeId}-error`}
                role="alert"
                className="mt-2 text-error text-sm"
              >
                {codeError}
              </p>
            )}
          </div>
        )}

        {startError && (
          <Alert
            variant="error"
            action={
              onRetry && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRetry}
                  disabled={busy}
                >
                  Retry
                </Button>
              )
            }
          >
            {startError}
          </Alert>
        )}
        {fullscreenBlocked && (
          <Alert variant="warning">
            This quiz has to be taken in fullscreen, and this browser can&apos;t
            do that. Open it on a computer, or in Chrome on Android.
          </Alert>
        )}
        {blocked && !fullscreenBlocked && !startError && (
          <Alert variant="warning">
            This level doesn&apos;t have any questions yet. Try another
            difficulty.
          </Alert>
        )}

        <div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={busy}
            disabled={blocked}
          >
            {loadingQuestions ? "Loading questions" : "Start quiz"}
          </Button>
          <p className="mt-3 text-center text-sm text-text-muted">
            Your time starts when you press Start.
          </p>
        </div>

        {!signedIn && (
          <p className="border-border border-t pt-3 text-center text-sm text-text-muted">
            <Link
              href="/sign-in"
              className="text-link underline-offset-4 hover:underline"
            >
              Sign in
            </Link>{" "}
            to save this attempt to your account.
          </p>
        )}
      </form>
    </Card>
  );
}
