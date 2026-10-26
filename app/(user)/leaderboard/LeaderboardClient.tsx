"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Container } from "@/components/layout/Container";
import { Alert, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import {
  buildOverallBoard,
  buildQuizBoard,
  LEADERBOARD_SHOWN,
} from "@/lib/leaderboard";
import { leaderboardFromDTO, type Leaderboard } from "@/lib/player-data";
import { fetchLeaderboard } from "@/lib/quizzes-api";
import type { LeaderboardDTO } from "@/lib/server/leaderboard";
import { cn } from "@/lib/utils";
import LeaderboardFilters, { type TimeFrame } from "./LeaderboardFilters";
import LeaderboardTable from "./LeaderboardTable";
import UserRank from "./UserRank";

function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the leaderboard" className="space-y-6">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Card className="divide-y divide-border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-4 w-12" />
          </div>
        ))}
      </Card>
    </div>
  );
}

const quizOptions = (board: Leaderboard) =>
  Object.entries(board.quizzes)
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title));

/**
 * The leaderboard. `initialBoard` is the unfiltered board, rendered with the page when the server knew who
 * was signed in. A filter change asks the server again; the board on screen stays (dimmed) until the new
 * one arrives, instead of blanking to a skeleton.
 */
export default function LeaderboardClient({
  initialBoard = null,
}: {
  initialBoard?: LeaderboardDTO | null;
}) {
  const { user } = useAuth();
  const [initialData] = useState(() => (initialBoard ? leaderboardFromDTO(initialBoard) : null));
  // The data on screen, and the quiz filter it was loaded for (the board's layout depends on it).
  const [shown, setShown] = useState<{ data: Leaderboard; quizId: string } | null>(() =>
    initialData ? { data: initialData, quizId: "" } : null
  );
  const shownData = useRef(shown?.data ?? null);
  shownData.current = shown?.data ?? null;
  const [pending, setPending] = useState(false);
  const [quizzes, setQuizzes] = useState<Array<{ id: string; title: string }>>(() =>
    shown ? quizOptions(shown.data) : []
  );
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("all");
  const [quizId, setQuizId] = useState("");
  const [difficulty, setDifficulty] = useState("");

  // One request per filter change; the server looks up names and titles in one batch. Nothing to ask while
  // the unfiltered board the page came with is still the one on screen.
  useEffect(() => {
    const unfiltered = timeFrame === "all" && !quizId && !difficulty;
    if (initialData && unfiltered && reloadKey === 0 && shownData.current === initialData) return;
    let cancelled = false;
    setPending(true);
    setFailed(null);
    fetchLeaderboard({ timeFrame, quizId, difficulty })
      .then((result) => {
        if (cancelled) return;
        setShown({ data: result, quizId });
        // The filter list comes with the data; it stays while a new request is running.
        setQuizzes(quizOptions(result));
      })
      .catch((error) => {
        console.error("Error fetching leaderboard data:", error);
        if (!cancelled) {
          setFailed(
            error instanceof Error && error.message
              ? error.message
              : "Check your connection and try again."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [timeFrame, quizId, difficulty, reloadKey, initialData]);

  const board = useMemo(() => {
    if (!shown) return null;
    const { data } = shown;
    return shown.quizId
      ? { mode: "quiz" as const, entries: buildQuizBoard(data.rows, data.users) }
      : { mode: "overall" as const, entries: buildOverallBoard(data.rows, data.users) };
  }, [shown]);

  // Ranks run over everyone, so a person outside the rows shown still sees their own place.
  const mine = board?.entries.find((entry) => entry.userId === user?.uid) ?? null;
  const filtered = timeFrame !== "all" || quizId !== "" || difficulty !== "";

  const clearFilters = () => {
    setTimeFrame("all");
    setQuizId("");
    setDifficulty("");
  };

  return (
    <div data-theme="dark" className="flex-1 bg-bg text-text">
      <Container className="py-8 sm:py-10">
        <p className="text-label">{"// LEADERBOARD"}</p>
        <h1 className="mt-2 text-3xl">Leaderboard</h1>
        <p className="mt-2 max-w-[65ch] text-text-muted">
          {quizId
            ? "Every attempt at this quiz, best score first. The faster time wins a tie."
            : "Points add up your best score on each quiz. Retaking a quiz can raise its score, but it only counts once."}
        </p>

        <div className="mt-6">
          <LeaderboardFilters
            quizzes={quizzes}
            timeFrame={timeFrame}
            quizId={quizId}
            difficulty={difficulty}
            onTimeFrameChange={setTimeFrame}
            onQuizChange={setQuizId}
            onDifficultyChange={setDifficulty}
          />
        </div>

        <section
          aria-label="Rankings"
          aria-busy={pending}
          className={cn("mt-6 transition-opacity duration-200", pending && board && "opacity-60")}
        >
          {failed ? (
            <Alert
              variant="error"
              title="We couldn't load the leaderboard"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setReloadKey((key) => key + 1)}
                >
                  Retry
                </Button>
              }
            >
              {failed}
            </Alert>
          ) : !board ? (
            <BoardSkeleton />
          ) : board.entries.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title={filtered ? "No results match these filters" : "No one is on the board yet"}
              description={
                filtered
                  ? "Try a wider time period, or look at every quiz and difficulty."
                  : "Finish a quiz and you'll be the first name here."
              }
              action={
                filtered ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/join">Find a quiz</Link>
                  </Button>
                )
              }
            />
          ) : (
            <div className="fade-in space-y-6">
              {user && <UserRank entry={mine} total={board.entries.length} />}
              {board.mode === "overall" ? (
                <LeaderboardTable
                  mode="overall"
                  entries={board.entries.slice(0, LEADERBOARD_SHOWN)}
                  userId={user?.uid}
                />
              ) : (
                <LeaderboardTable
                  mode="quiz"
                  entries={board.entries.slice(0, LEADERBOARD_SHOWN)}
                  userId={user?.uid}
                />
              )}
              {board.entries.length > LEADERBOARD_SHOWN && (
                <p className="text-sm text-text-muted">
                  Showing the top {LEADERBOARD_SHOWN} of {board.entries.length}.
                </p>
              )}
            </div>
          )}
        </section>
      </Container>
    </div>
  );
}
