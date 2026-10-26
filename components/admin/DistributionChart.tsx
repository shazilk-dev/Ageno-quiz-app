import { Card } from "@/components/ui";
import type { Band } from "@/lib/admin-analytics";

interface DistributionChartProps {
  title: string;
  /** One line under the title: what is counted. */
  caption?: string;
  bands: Band[];
  /** Heading level: 3 under a section heading (the dashboard), 2 straight under the page title. */
  as?: "h2" | "h3";
}

/**
 * A distribution as labelled bars. One series, so one colour (teal); the numbers are written out next to
 * each bar, so nothing depends on colour or hover and a screen reader reads a plain list.
 */
export function DistributionChart({ title, caption, bands, as: Heading = "h3" }: DistributionChartProps) {
  const total = bands.reduce((sum, band) => sum + band.count, 0);
  const largest = Math.max(1, ...bands.map((band) => band.count));

  return (
    <Card className="p-5">
      <Heading className="text-lg">{title}</Heading>
      {caption && <p className="mt-1 text-sm text-text-muted">{caption}</p>}

      {total === 0 ? (
        <p className="mt-6 text-sm text-text-muted">Nothing to show yet.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {bands.map((band) => (
            <li key={band.label} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm">
              <span className="text-text-body">{band.label}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${(band.count / largest) * 100}%` }}
                />
              </span>
              <span className="min-w-16 text-right font-mono tabular-nums text-text-muted">
                {band.count}
                <span className="sr-only">{band.count === 1 ? " result" : " results"}</span>
                <span aria-hidden="true"> · {Math.round((band.count / total) * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
