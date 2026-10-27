import { cn } from "@/lib/utils";

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Small mono count after the label, e.g. quizzes in a filter. */
  count?: number;
  className?: string;
}

/** Toggle pill for filters. `aria-pressed` carries the state; the pill is inset so the hit area stays 44px tall. */
export function Chip({ label, active, onClick, count, className }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative inline-flex min-h-11 items-center px-1 transition-fast",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-medium font-mono text-xs uppercase tracking-[0.05em] transition-fast",
          active
            ? "border-accent bg-accent text-ink"
            : "border-control-border text-text-muted hover:border-accent hover:text-text"
        )}
      >
        {label}
        {count !== undefined && (
          <span className="tabular-nums opacity-80">{count}</span>
        )}
      </span>
    </button>
  );
}
