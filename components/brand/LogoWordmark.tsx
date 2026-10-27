import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

interface LogoWordmarkProps {
  variant?: "auto" | "light" | "dark";
  blink?: boolean;
  /** Show only the mark below the `sm` breakpoint. */
  hideTextOnMobile?: boolean;
  /** Show the small mono "by agenoverse" label under the name. */
  byline?: boolean;
  className?: string;
}

const textStyles = {
  auto: "text-text",
  light: "text-bone",
  dark: "text-ink",
} as const;

const bylineStyles = {
  auto: "text-text-muted",
  light: "text-text-muted",
  dark: "text-ink/60",
} as const;

/** Logo mark + lowercase "ageno quiz", with an optional mono "by agenoverse" label. */
export function LogoWordmark({
  variant = "auto",
  blink = false,
  hideTextOnMobile = false,
  byline = false,
  className,
}: LogoWordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Logo variant={variant} blink={blink} decorative width={28} height={28} />
      <span
        className={cn(
          "flex flex-col leading-none",
          hideTextOnMobile && "hidden sm:flex"
        )}
      >
        <span
          className={cn(
            "text-xl font-semibold tracking-[-0.02em]",
            textStyles[variant]
          )}
        >
          ageno quiz
        </span>
        {byline && (
          <span
            className={cn(
              "mt-1 font-mono text-[10px] tracking-wide",
              bylineStyles[variant]
            )}
          >
            by agenoverse
          </span>
        )}
      </span>
    </span>
  );
}
