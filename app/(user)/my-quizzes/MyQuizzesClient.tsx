"use client";

import { formatDistanceToNow } from "date-fns";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Container } from "@/components/layout/Container";
import AttemptRow from "@/components/my-quizzes/AttemptRow";
import { Alert, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { personalBestId, summarizeAttempts } from "@/lib/my-quizzes";
import { myAttemptFromDTO, type MyAttempt } from "@/lib/player-data";
import { fetchMyAttempts } from "@/lib/quizzes-api";
import type { MyAttemptDTO } from "@/lib/server/history";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 sm:px-5 sm:py-4">
      <dt className="text-label">{label}</dt>
      <dd className="mt-1 font-mono text-2xl tabular-nums">{value}</dd>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your attempts">
      <Skeleton className="h-[5.5rem] w-full rounded-lg" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[4.75rem] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * A person's finished attempts. `initialAttempts` comes with the page when the server knew who was signed
 * in; otherwise the browser fetches them once its sign-in is ready.
 */
export default function MyQuizzesClient({
  initialAttempts = null,
}: {
  initialAttempts?: MyAttemptDTO[] | null;
}) {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState<MyAttempt[] | null>(() =>
    initialAttempts ? initialAttempts.map(myAttemptFromDTO) : null
  );
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    setAttempts(null);
    try {
      setAttempts(await fetchMyAttempts());
    } catch (error) {
      console.error("Error fetching quiz attempts:", error);
      setFailed(true);
    }
  }, []);

  const hadInitial = useRef(initialAttempts !== null);
  useEffect(() => {
    if (user && !hadInitial.current) void load();
  }, [user, load]);

  const stats = useMemo(() => summarizeAttempts(attempts ?? []), [attempts]);
  const bestId = useMemo(() => personalBestId(attempts ?? []), [attempts]);

  return (
    <div data-theme="dark" className="flex-1 bg-bg text-text">
      <Container className="py-8 sm:py-10">
        <p className="text-label">{"// MY QUIZZES"}</p>
        <h1 className="mt-2 text-3xl">My quizzes</h1>
        <p className="mt-2 max-w-[65ch] text-text-muted">
          Every quiz you&apos;ve finished, newest first. Open one to see how you
          did on each question.
        </p>

        <div className="mt-8">
          {failed ? (
            <Alert
              variant="error"
              title="We couldn't load your attempts"
              action={
                <Button variant="secondary" size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              }
            >
              Check your connection and try again.
            </Alert>
          ) : attempts === null ? (
            <PageSkeleton />
          ) : attempts.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="You haven't finished a quiz yet"
              description="When you do, your score and a question-by-question review will show up here."
              action={
                <Button asChild>
                  <Link href="/join">Find a quiz</Link>
                </Button>
              }
            />
          ) : (
            <>
              <Card>
                <dl className="grid grid-cols-2 divide-border max-sm:[&>*:nth-child(n+3)]:border-border max-sm:[&>*:nth-child(n+3)]:border-t sm:grid-cols-4 sm:divide-x">
                  <Stat label="Attempts" value={String(stats.total)} />
                  <Stat
                    label="Average"
                    value={stats.average === null ? "—" : `${stats.average}%`}
                  />
                  <Stat
                    label="Best"
                    value={stats.best === null ? "—" : `${stats.best}%`}
                  />
                  <Stat
                    label="Last attempt"
                    value={
                      stats.lastAt
                        ? formatDistanceToNow(stats.lastAt, { addSuffix: true })
                        : "—"
                    }
                  />
                </dl>
              </Card>

              <section aria-labelledby="attempts-heading" className="mt-8">
                <h2 id="attempts-heading" className="text-xl">
                  Your attempts
                </h2>
                <ul className="fade-in mt-4 space-y-3">
                  {attempts.map((attempt) => (
                    <li key={attempt.id}>
                      <AttemptRow attempt={attempt} best={attempt.id === bestId} />
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </Container>
    </div>
  );
}
