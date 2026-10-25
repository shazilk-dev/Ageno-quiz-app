"use client";

import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { Alert, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import DifficultyOptions, { type DifficultyOption } from "./DifficultyOptions";

interface LobbyStartCardProps {
  quizId: string;
  requiresAccessCode: boolean;
  /** A code entered earlier this session is on file, so the field isn't needed unless the server refuses it. */
  hasRememberedCode: boolean;
  /** The server said the code was wrong or missing. */
  codeError: string | null;
  difficultyOptions: DifficultyOption[];
  selectedDifficulty: string;
  onSelectDifficulty: (value: string) => void;
  /** The quiz is still loading. */
  loadingQuestions: boolean;
  /** The chosen level has questions to ask. */
  hasQuestions: boolean;
  starting: boolean;
  startError: string | null;
  /** null while the sign-in state is still resolving. */
  signedIn: boolean | null;
  /** Called with the code typed into the field, if the field was showing. */
  onStart: (code?: string) => void;
  /** Shown beside the load error. */
  onRetry?: () => void;
  fullscreenBlocked?: boolean;
}

/**
 * Right column: pick a difficulty, enter the code if the quiz needs one, start. An open quiz starts in
 * one click; a code-protected one in one Enter. Starting needs an account, so visitors who aren't signed
 * in get a sign-in button that brings them back to this quiz.
 */
export default function LobbyStartCard({
  quizId,
  requiresAccessCode,
  hasRememberedCode,
  codeError,
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
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const showCodeField =
    signedIn === true && requiresAccessCode && (!hasRememberedCode || !!codeError);
  const shownError = localError ?? codeError;

  const busy = loadingQuestions || starting || signedIn === null;
  const blocked = fullscreenBlocked || (!loadingQuestions && !hasQuestions);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || blocked || signedIn !== true) return;

    if (showCodeField) {
      if (!code.trim()) {
        setLocalError("Enter the access code you were given.");
        return;
      }
      onStart(code.trim());
      return;
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

        {showCodeField && (
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
                if (localError) setLocalError(null);
              }}
              placeholder="Enter access code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={shownError ? true : undefined}
              aria-describedby={shownError ? `${codeId}-error` : undefined}
              className={cn(
                "h-12 w-full rounded-md border bg-bg px-4 font-mono text-base text-text uppercase tracking-[0.12em] transition-fast placeholder:font-sans placeholder:text-text-muted/70 placeholder:normal-case placeholder:tracking-normal hover:border-border-strong focus-visible:border-accent",
                shownError ? "border-error" : "border-border"
              )}
            />
            {shownError && (
              <p
                id={`${codeId}-error`}
                role="alert"
                className="mt-2 text-error text-sm"
              >
                {shownError}
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
          {signedIn === false ? (
            <>
              <Button asChild size="lg" className="w-full" disabled={blocked}>
                <Link href={`/sign-in?redirectTo=${encodeURIComponent(`/q/${quizId}`)}`}>
                  Sign in to start
                </Link>
              </Button>
              <p className="mt-3 text-center text-sm text-text-muted">
                You need an account to take a quiz, so your results are saved.
              </p>
            </>
          ) : (
            <>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={busy}
                disabled={blocked}
              >
                {loadingQuestions ? "Loading quiz" : "Start quiz"}
              </Button>
              <p className="mt-3 text-center text-sm text-text-muted">
                Your time starts when you press Start.
              </p>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}
