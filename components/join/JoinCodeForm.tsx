"use client";

import { CircleAlert, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui";
import { getQuizByCode, type Quiz } from "@/firebase/firestore";
import { markCodeVerified } from "@/lib/quiz-access";
import { cn } from "@/lib/utils";

interface JoinCodeFormProps {
  /** Quizzes already loaded on the page. A code is matched against these first, so joining costs no extra read. */
  quizzes: Quiz[];
  /** null while the auth state is still resolving. */
  signedIn: boolean | null;
  className?: string;
}

/** Join by code in one action: type, press Enter, land in the quiz lobby. */
export default function JoinCodeForm({
  quizzes,
  signedIn,
  className,
}: JoinCodeFormProps) {
  const router = useRouter();
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = code.trim();

    if (!value) {
      setError("Enter the access code you were given.");
      return;
    }

    setError(null);

    const known = quizzes.find(
      (quiz) => quiz.accessCode.toLowerCase() === value.toLowerCase()
    );
    if (known) {
      markCodeVerified(known.id);
      setJoining(true);
      router.push(`/${known.accessCode}`);
      return;
    }

    // The list is empty only when it hasn't loaded, so ask Firestore directly in that case.
    if (quizzes.length > 0) {
      setError("We couldn't find a quiz with that code. Check it and try again.");
      return;
    }

    setJoining(true);
    try {
      const quiz = await getQuizByCode(value);
      if (!quiz) {
        setError(
          "We couldn't find a quiz with that code. Check it and try again."
        );
        setJoining(false);
        return;
      }
      markCodeVerified(quiz.id);
      router.push(`/${quiz.accessCode}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setJoining(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={className}>
      <label htmlFor={inputId} className="sr-only">
        Access code
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
          <KeyRound
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="text"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError(null);
            }}
            placeholder="Enter access code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? messageId : undefined}
            className={cn(
              "h-11 w-full rounded-md border bg-surface pr-4 pl-10 font-mono text-base text-text uppercase tracking-[0.12em] transition-fast placeholder:font-sans placeholder:text-text-muted/70 placeholder:normal-case placeholder:tracking-normal hover:border-border-strong focus-visible:border-accent",
              error ? "border-error" : "border-border"
            )}
          />
        </div>
        <Button type="submit" loading={joining}>
          Join quiz
        </Button>
      </div>

      <div className="mt-2 min-h-5 text-sm">
        {error ? (
          <p
            id={messageId}
            role="alert"
            className="flex items-start gap-1.5 text-error"
          >
            <CircleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {error}
          </p>
        ) : (
          signedIn === false && (
            <p className="text-text-muted">
              <Link
                href="/sign-in"
                className="text-link underline-offset-4 hover:underline"
              >
                Sign in
              </Link>{" "}
              to save your progress.
            </p>
          )
        )}
      </div>
    </form>
  );
}
