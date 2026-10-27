"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { SegmentedControl } from "@/components/ui";
import { useThemePreference } from "@/hooks/useThemePreference";
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
const LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};
const NEXT: Record<ThemePreference, ThemePreference> = {
  light: "dark",
  dark: "system",
  system: "light",
};

interface ThemeToggleProps {
  /** `icon`: one button that steps Light, Dark, System (header, exam bar). `segmented`: all three shown (menu, profile). */
  variant?: "icon" | "segmented";
  className?: string;
}

/** Light / Dark / System. The choice is kept on this device; System follows the OS live. */
export default function ThemeToggle({
  variant = "icon",
  className,
}: ThemeToggleProps) {
  const [preference, setPreference] = useThemePreference();

  if (variant === "segmented") {
    return (
      <SegmentedControl
        label="Theme"
        options={THEME_OPTIONS}
        value={preference}
        onChange={setPreference}
        className={className}
      />
    );
  }

  const Icon = ICONS[preference];
  const next = NEXT[preference];
  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={`Theme: ${LABELS[preference]}. Switch to ${LABELS[next]}.`}
      title={`Theme: ${LABELS[preference]}`}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-md text-text-muted transition-fast hover:text-text",
        className
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
