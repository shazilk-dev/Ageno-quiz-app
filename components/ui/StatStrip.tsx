import { Card } from "./Card";
import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: string;
}

interface StatStripProps {
  stats: Stat[];
  className?: string;
}

/**
 * A few headline numbers in one card, divided by hairlines: not a row of identical boxes. Two columns on
 * phones, one row from `sm` up when there are four or fewer, otherwise as many as fit.
 */
export function StatStrip({ stats, className }: StatStripProps) {
  return (
    <Card className={className}>
      <dl
        className={cn(
          "grid grid-cols-2 divide-border max-sm:[&>*:nth-child(n+3)]:border-border max-sm:[&>*:nth-child(n+3)]:border-t sm:divide-x",
          stats.length <= 4 ? "sm:grid-cols-4" : "sm:grid-cols-5"
        )}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="px-4 py-3 sm:px-5 sm:py-4">
            <dt className="text-label">{stat.label}</dt>
            <dd className="mt-1 font-mono text-2xl tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
