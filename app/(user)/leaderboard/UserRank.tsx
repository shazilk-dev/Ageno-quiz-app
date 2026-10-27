import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { formatClock } from "@/lib/exam/answers";
import type { LeaderboardEntry } from "@/lib/leaderboard";

interface UserRankProps {
  /** The signed-in person's entry, from the full ranking (not only the rows shown). */
  entry: LeaderboardEntry | null;
  /** How many people are ranked. */
  total: number;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label">{label}</dt>
      <dd className="mt-1 font-mono text-lg tabular-nums">{value}</dd>
    </div>
  );
}

/** Where the signed-in person stands under the current filters, or how to get on the board. */
export default function UserRank({ entry, total }: UserRankProps) {
  if (!entry) {
    return (
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[65ch] text-text-muted">
          You&apos;re not on this board yet. Finish a quiz that matches these
          filters and your place shows up here.
        </p>
        <Button asChild variant="secondary" className="shrink-0">
          <Link href="/join">Find a quiz</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="border-warm/40 p-5">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <p className="text-label">Your place</p>
          <p className="mt-1 font-mono text-4xl text-warm-text tabular-nums leading-none">
            #{entry.rank}
            <span className="ml-2 text-base text-text-muted">of {total}</span>
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {"points" in entry ? (
            <>
              <Fact label="Points" value={String(entry.points)} />
              <Fact label="Average" value={`${entry.average}%`} />
              <Fact label="Quizzes" value={String(entry.quizCount)} />
            </>
          ) : (
            <>
              <Fact label="Score" value={`${entry.score}%`} />
              <Fact label="Time" value={formatClock(entry.timeTaken)} />
            </>
          )}
        </dl>
      </div>
    </Card>
  );
}
