import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatDuration, secondsTaken } from "@/lib/admin-analytics";
import type { ReportRow } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

const th = "text-label px-3 py-3 text-left first:pl-5 last:pr-5";
const td = "px-3 py-3 first:pl-5 last:pr-5";

const when = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Unknown";

/** What the integrity record holds, in words. Empty when nothing was recorded. */
function flags(row: ReportRow): string[] {
  const list: string[] = [];
  if (row.tabSwitchCount > 0) {
    list.push(`${row.tabSwitchCount} tab ${row.tabSwitchCount === 1 ? "switch" : "switches"}`);
  }
  if (row.fullscreenExits > 0) {
    list.push(`${row.fullscreenExits} fullscreen ${row.fullscreenExits === 1 ? "exit" : "exits"}`);
  }
  if (row.blurCount > 0) list.push(`${row.blurCount} focus lost`);
  return list;
}

/** Finished results, newest first by default. Time and integrity columns drop away on narrow screens. */
export function ReportsTable({ rows }: { rows: ReportRow[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Finished quiz results</caption>
          <thead className="border-border border-b">
            <tr>
              <th scope="col" className={th}>Quiz</th>
              <th scope="col" className={th}>Player</th>
              <th scope="col" className={th}>Score</th>
              <th scope="col" className={cn(th, "hidden sm:table-cell")}>Time</th>
              <th scope="col" className={cn(th, "hidden md:table-cell")}>Submitted</th>
              <th scope="col" className={cn(th, "hidden lg:table-cell")}>Recorded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const recorded = flags(row);
              return (
                <tr key={row.id}>
                  <td className={cn(td, "max-w-[14rem]")}>
                    <p className="truncate font-medium">{row.quizTitle || "Unknown quiz"}</p>
                    {row.difficulty && (
                      <Badge variant="outline" className="mt-1">
                        {row.difficulty}
                      </Badge>
                    )}
                  </td>
                  <td className={cn(td, "max-w-[10rem] truncate")}>
                    <Link
                      href={`/quiz-reports/${encodeURIComponent(row.id)}`}
                      className="text-link underline-offset-2 hover:underline"
                      aria-label={`See ${row.userName || "this person"}'s answers to ${row.quizTitle || "this quiz"}`}
                    >
                      {row.userName || "Unknown user"}
                    </Link>
                  </td>
                  <td className={cn(td, "font-mono text-base tabular-nums")}>
                    {row.score === null ? (
                      <span className="font-sans text-sm text-text-muted">Not scored</span>
                    ) : (
                      `${row.score}%`
                    )}
                  </td>
                  <td className={cn(td, "hidden font-mono text-text-muted sm:table-cell")}>
                    {formatDuration(secondsTaken(row))}
                  </td>
                  <td className={cn(td, "hidden text-text-muted md:table-cell")}>{when(row.submittedAt)}</td>
                  <td className={cn(td, "hidden text-text-muted lg:table-cell")}>
                    {recorded.length ? recorded.join(", ") : "Nothing"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
