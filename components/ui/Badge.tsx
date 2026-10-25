import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "teal" | "amber" | "outline";

interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  variant?: Variant;
  className?: string;
}

const variantStyles: Record<Variant, string> = {
  default: "bg-surface text-text-muted",
  teal: "bg-teal text-ink",
  // Amber is reserved for community moments (for example a `challenge` quiz).
  amber: "bg-amber text-ink",
  outline: "border border-border text-text-muted",
};

/** Small mono pill for difficulty, status and categories. */
export function Badge({
  variant = "default",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 font-medium font-mono text-xs uppercase tracking-[0.05em]",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
