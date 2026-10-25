import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends ComponentPropsWithoutRef<"div"> {
  /** Lift 2px and strengthen the border on hover. Use when the whole card is a link or button. */
  interactive?: boolean;
}

/** Flat surface: 1px border, 16px radius, no gradient and no shadow. */
export function Card({ interactive = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface",
        interactive &&
          "transition-fast hover:-translate-y-0.5 hover:border-border-strong",
        className
      )}
      {...props}
    />
  );
}
