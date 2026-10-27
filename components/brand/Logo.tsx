import { cn } from "@/lib/utils";

interface LogoProps {
  /** `auto` (default) follows the theme. `light` = bone strokes for dark backgrounds, `dark` = ink strokes for light ones. */
  variant?: "auto" | "light" | "dark";
  width?: number | string;
  height?: number | string;
  /** Play the one-shot cursor blink. */
  blink?: boolean;
  /** Keep the cursor blinking (hero signature). Overrides `blink`. */
  live?: boolean;
  /** Hide from assistive tech when text next to the logo already names the brand. */
  decorative?: boolean;
  className?: string;
}

const strokeStyles = {
  auto: "stroke-text",
  light: "stroke-bone",
  dark: "stroke-ink",
} as const;

/** The Cursor A: a terminal-style "A" whose crossbar is a teal block cursor. */
export function Logo({
  variant = "auto",
  width = 32,
  height = 32,
  blink = false,
  live = false,
  decorative = false,
  className,
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={width}
      height={height}
      fill="none"
      className={cn("shrink-0", className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
    >
      {!decorative && <title>Ageno Quiz</title>}
      <path
        d="M6.4 29.2L16 6.4L25.6 29.2"
        strokeWidth="3.4"
        strokeLinejoin="miter"
        strokeMiterlimit="10"
        className={strokeStyles[variant]}
      />
      <rect
        x="13"
        y="19.4"
        width="6"
        height="4.5"
        className={cn(
          "fill-teal",
          live ? "logo-cursor-live" : blink && "logo-cursor-blink"
        )}
      />
    </svg>
  );
}
