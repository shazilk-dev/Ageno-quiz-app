"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export interface DifficultyOption {
  value: string;
  label: string;
  /** What sets this level apart (time, points). Only what differs between levels. */
  detail?: string;
}

interface DifficultyOptionsProps {
  options: DifficultyOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Stacked radio rows. Native radios, so arrow keys and screen readers work without extra code. */
export default function DifficultyOptions({
  options,
  value,
  onChange,
  disabled = false,
}: DifficultyOptionsProps) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-label mb-2">Difficulty</legend>
      <div className="space-y-2">
        {options.map((option) => (
          <label key={option.value} className="relative block">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-4 py-2 transition-fast",
                "hover:border-border-strong",
                "peer-checked:border-accent peer-checked:bg-accent/10",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                "peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border transition-fast",
                    option.value === value
                      ? "border-accent"
                      : "border-border-strong"
                  )}
                >
                  {option.value === value && (
                    <span className="size-2 rounded-full bg-accent" />
                  )}
                </span>
                <span className="font-medium">{option.label}</span>
              </span>
              {option.detail && (
                <span className="font-mono text-text-muted text-xs tabular-nums">
                  {option.detail}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
