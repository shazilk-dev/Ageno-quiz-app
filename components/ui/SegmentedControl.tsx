"use client";

import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Second line under the label, e.g. "30 min · ×1.5". */
  description?: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  /** Names the group for screen readers, e.g. "Difficulty". */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Hide the visible label and keep it for assistive tech only. */
  hideLabel?: boolean;
  className?: string;
}

/**
 * Pick one of a few options. Built on native radio inputs, so arrow keys, focus and form semantics come
 * for free. Teal marks the selected option.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel = false,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className={cn("text-label mb-2", hideLabel && "sr-only")}>
        {label}
      </legend>
      <div className="grid auto-cols-fr grid-flow-col gap-2">
        {options.map((option) => (
          <label key={option.value} className="relative block min-w-0">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-11 cursor-pointer flex-col justify-center rounded-md border border-control-border px-3 py-2 text-left transition-fast",
                "hover:border-text-muted",
                "peer-checked:border-accent peer-checked:bg-accent/10",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                "peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
              )}
            >
              <span className="font-medium text-sm">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 font-mono text-text-muted text-xs tabular-nums">
                  {option.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
