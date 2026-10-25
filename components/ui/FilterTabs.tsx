import { cn } from "@/lib/utils";

export interface FilterTabOption<T extends string> {
  value: T;
  label: string;
  /** Mono count after the label, e.g. how many results the tab would show. */
  count?: number;
}

interface FilterTabsProps<T extends string> {
  /** Names the group for screen readers, e.g. "Filter by access". */
  label: string;
  options: FilterTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Underlined filter tabs with counts, for narrowing a list in place. They are toggle buttons
 * (`aria-pressed`), not a tablist: the list below is the same region whichever tab is active.
 * The active underline sits on the parent's bottom border, so give the parent `border-b`.
 */
export function FilterTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: FilterTabsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("-mb-px flex gap-1 overflow-x-auto", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-fast",
              active
                ? "border-accent font-medium text-text"
                : "border-transparent text-text-muted hover:text-text"
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  active ? "text-accent" : "text-text-muted"
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
