import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/layout/Container";
import { Alert, Button, Card, Skeleton } from "@/components/ui";

/** Dark surface shared by every lobby screen. */
export function LobbyFrame({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" className="flex-1 bg-bg text-text">
      <Container className="py-6 sm:py-8">{children}</Container>
    </div>
  );
}

/** Same grid as the real lobby, so nothing jumps when the quiz arrives. */
export function LobbySkeleton() {
  return (
    <LobbyFrame>
      <div
        role="status"
        aria-label="Loading quiz"
        className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12"
      >
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-4 h-10 w-2/3" />
          <div className="mt-5 space-y-2">
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-4 w-5/6 max-w-xl" />
          </div>
          <Skeleton className="mt-8 h-20 w-full max-w-xl" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-4/5 max-w-md" />
          </div>
        </div>
        <Card className="space-y-4 p-5 sm:p-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      </div>
    </LobbyFrame>
  );
}

function MessageScreen({
  label,
  title,
  children,
  actions,
}: {
  label: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <LobbyFrame>
      <div className="max-w-xl py-6 sm:py-12">
        <p className="text-label">{label}</p>
        <h1 className="mt-2 text-3xl">{title}</h1>
        <p className="mt-3 text-text-muted">{children}</p>
        <div className="mt-6 flex flex-wrap gap-3">{actions}</div>
      </div>
    </LobbyFrame>
  );
}

/** A code that matches no quiz. */
export function QuizNotFound() {
  return (
    <MessageScreen
      label="// QUIZ NOT FOUND"
      title="We couldn't find that quiz"
      actions={
        <Button asChild>
          <Link href="/join">Back to quizzes</Link>
        </Button>
      }
    >
      The code may have a typo, or the quiz may have been removed. Check it and
      try again, or pick a quiz from the list.
    </MessageScreen>
  );
}

/** A quiz an admin has switched off. */
export function QuizInactive({ title }: { title: string }) {
  return (
    <MessageScreen
      label="// NOT OPEN"
      title="This quiz isn't open right now"
      actions={
        <Button asChild>
          <Link href="/join">Browse other quizzes</Link>
        </Button>
      }
    >
      {title} has been switched off by its owner. Check back later, or ask
      whoever shared it with you.
    </MessageScreen>
  );
}

/** The quiz couldn't be loaded at all (network, not "doesn't exist"). */
export function QuizLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <LobbyFrame>
      <div className="max-w-xl py-6 sm:py-12">
        <Alert
          variant="error"
          title="We couldn't load this quiz"
          action={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          Check your connection and try again.
        </Alert>
      </div>
    </LobbyFrame>
  );
}
