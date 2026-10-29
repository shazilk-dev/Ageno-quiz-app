import { Card } from "@/components/ui";
import type { TrendDay } from "@/lib/admin-types";

const label = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Finished results per day, one bar a day, in one colour. The bars are for the eye only; a sentence below
 * says the same in words (total, busiest day), so nothing depends on colour, size or hover. Days are UTC.
 */
export function TrendChart({ days, as: Heading = "h3" }: { days: TrendDay[]; as?: "h2" | "h3" }) {
  const total = days.reduce((sum, day) => sum + day.results, 0);
  const busiest = days.reduce<TrendDay | null>(
    (best, day) => (day.results > (best?.results ?? 0) ? day : best),
    null
  );
  const largest = Math.max(1, ...days.map((day) => day.results));

  return (
    <Card className="p-5">
      <Heading className="text-lg">Results per day</Heading>
      <p className="mt-1 text-sm text-text-muted">
        {total === 0
          ? `No results in the last ${days.length} days.`
          : `${total} ${total === 1 ? "result" : "results"} in the last ${days.length} days` +
            (busiest ? `; the busiest day was ${label(busiest.day)} with ${busiest.results}.` : ".")}
      </p>
      {total > 0 && (
        <>
          <div className="mt-5 flex h-24 items-end gap-0.5" aria-hidden="true">
            {days.map((day) => (
              <span
                key={day.day}
                title={`${label(day.day)}: ${day.results}`}
                className="min-h-px flex-1 rounded-t-sm bg-accent"
                style={{ height: day.results === 0 ? "1px" : `${Math.max(4, (day.results / largest) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-text-muted text-xs" aria-hidden="true">
            <span>{label(days[0].day)}</span>
            <span>{label(days[days.length - 1].day)}</span>
          </div>
        </>
      )}
    </Card>
  );
}
