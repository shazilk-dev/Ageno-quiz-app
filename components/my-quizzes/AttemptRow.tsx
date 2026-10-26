import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { minutesSpent } from "@/lib/my-quizzes";
import type { MyAttempt } from "@/lib/quizzes-api";

interface AttemptRowProps {
  attempt: MyAttempt;
  /** Marks the attempt as the person's best (amber: a personal best is a community-style moment). */
  best?: boolean;
}

/** What the integrity record says, in plain words. Empty when nothing was recorded. */
function notes({ tabSwitchCount, fullscreenExits }: MyAttempt): string[] {
  const list: string[] = [];
  if (tabSwitchCount > 0) {
    list.push(tabSwitchCount === 1 ? "1 tab switch" : `${tabSwitchCount} tab switches`);
  }
  if (fullscreenExits > 0) {
    list.push(
      fullscreenExits === 1 ? "left fullscreen once" : `left fullscreen ${fullscreenExits} times`
    );
  }
  return list;
}

/**
 * One finished attempt. The whole row is the link to its review (44px+ tall, one tab stop); results
 * saved before reviews existed show the same facts without a link.
 */
export default function AttemptRow({ attempt, best = false }: AttemptRowProps) {
  const { score } = attempt;
  const flagged = notes(attempt);

  const body = (
    <div className="flex items-center gap-4 p-4 sm:p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="truncate text-base text-text">{attempt.quizTitle}</h3>
          <Badge variant="outline">{attempt.selectedDifficulty}</Badge>
          {best && <Badge variant="amber">Personal best</Badge>}
        </div>
        <p className="mt-1 font-mono text-sm text-text-muted tabular-nums">
          <time dateTime={attempt.submittedAt.toISOString()}>
            {format(attempt.submittedAt, "MMM d, yyyy · h:mm a")}
          </time>
          {" · "}
          {minutesSpent(attempt)} min
        </p>
        {flagged.length > 0 && (
          <p className="mt-1 text-sm text-text-muted">
            Recorded: {flagged.join(", ")}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        {score === null ? (
          <p className="text-sm text-text-muted">Not scored</p>
        ) : (
          <p className="font-mono text-2xl text-text tabular-nums">{score}%</p>
        )}
      </div>

      {attempt.hasResult && (
        <ChevronRight
          className="size-5 shrink-0 text-text-muted"
          aria-hidden="true"
        />
      )}
    </div>
  );

  if (!attempt.hasResult) {
    return <Card>{body}</Card>;
  }

  return (
    <Card interactive>
      <Link
        href={`/my-quizzes/${encodeURIComponent(attempt.id)}`}
        className="block rounded-lg"
      >
        {body}
      </Link>
    </Card>
  );
}
