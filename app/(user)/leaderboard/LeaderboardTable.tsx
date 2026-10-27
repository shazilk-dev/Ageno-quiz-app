import { Badge, Card } from "@/components/ui";
import { formatClock } from "@/lib/exam/answers";
import type { OverallEntry, QuizEntry } from "@/lib/leaderboard";
import { cn } from "@/lib/utils";

const date = (value: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(value);

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

type Props =
  | { mode: "overall"; entries: OverallEntry[]; userId?: string }
  | { mode: "quiz"; entries: QuizEntry[]; userId?: string };

const th = "px-3 py-3 text-left font-medium text-label first:pl-4 last:pr-4 sm:px-4";
const td = "px-3 py-3 first:pl-4 last:pr-4 sm:px-4";

/** Top three get an amber rank; the signed-in person's own row is tinted amber and tagged "You". */
function RankCell({ rank }: { rank: number }) {
  return (
    <td
      className={cn(
        td,
        "w-14 font-mono tabular-nums",
        rank <= 3 ? "font-semibold text-warm-text" : "text-text-muted"
      )}
    >
      {rank}
    </td>
  );
}

function PlayerCell({ name, you }: { name: string; you: boolean }) {
  return (
    <td className={cn(td, "max-w-[12rem] font-medium")}>
      <span className="flex items-center gap-2">
        <span className="truncate">{name}</span>
        {you && <Badge variant="amber">You</Badge>}
      </span>
    </td>
  );
}

export default function LeaderboardTable(props: Props) {
  const { userId } = props;
  const rowClass = (entryUserId: string) =>
    cn(
      "border-border border-t",
      userId && entryUserId === userId && "bg-warm/10"
    );

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            {props.mode === "overall"
              ? "Overall ranking by points"
              : "Ranking for this quiz by score"}
          </caption>
          <thead>
            {props.mode === "overall" ? (
              <tr>
                <th scope="col" className={th}>Rank</th>
                <th scope="col" className={th}>Player</th>
                <th scope="col" className={th}>Points</th>
                <th scope="col" className={cn(th, "hidden sm:table-cell")}>Average</th>
                <th scope="col" className={cn(th, "hidden md:table-cell")}>Quizzes</th>
                <th scope="col" className={cn(th, "hidden lg:table-cell")}>Level</th>
                <th scope="col" className={cn(th, "hidden lg:table-cell")}>Last active</th>
              </tr>
            ) : (
              <tr>
                <th scope="col" className={th}>Rank</th>
                <th scope="col" className={th}>Player</th>
                <th scope="col" className={th}>Score</th>
                <th scope="col" className={cn(th, "hidden sm:table-cell")}>Difficulty</th>
                <th scope="col" className={cn(th, "hidden sm:table-cell")}>Time</th>
                <th scope="col" className={cn(th, "hidden md:table-cell")}>Completed</th>
              </tr>
            )}
          </thead>
          <tbody>
            {props.mode === "overall"
              ? props.entries.map((entry) => (
                  <tr key={entry.id} className={rowClass(entry.userId)}>
                    <RankCell rank={entry.rank} />
                    <PlayerCell name={entry.username} you={entry.userId === userId} />
                    <td className={cn(td, "font-mono text-base tabular-nums")}>{entry.points}</td>
                    <td className={cn(td, "hidden font-mono tabular-nums sm:table-cell")}>
                      {entry.average}%
                    </td>
                    <td className={cn(td, "hidden text-text-muted md:table-cell")}>
                      {entry.quizCount}
                      <span>
                        {" "}
                        ({entry.attempts} {entry.attempts === 1 ? "attempt" : "attempts"})
                      </span>
                    </td>
                    <td className={cn(td, "hidden lg:table-cell")}>
                      <Badge variant="outline">{entry.level}</Badge>
                    </td>
                    <td className={cn(td, "hidden text-text-muted lg:table-cell")}>
                      {date(entry.completedAt)}
                    </td>
                  </tr>
                ))
              : props.entries.map((entry) => (
                  <tr key={entry.id} className={rowClass(entry.userId)}>
                    <RankCell rank={entry.rank} />
                    <PlayerCell name={entry.username} you={entry.userId === userId} />
                    <td className={cn(td, "font-mono text-base tabular-nums")}>{entry.score}%</td>
                    <td className={cn(td, "hidden sm:table-cell")}>
                      <Badge variant="outline">{capitalise(entry.difficulty || "medium")}</Badge>
                    </td>
                    <td className={cn(td, "hidden font-mono tabular-nums sm:table-cell")}>
                      {formatClock(entry.timeTaken)}
                    </td>
                    <td className={cn(td, "hidden text-text-muted md:table-cell")}>
                      {date(entry.completedAt)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
