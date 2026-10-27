import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/** Placeholder block for loading lists and cards. Size it with className (h-4 w-1/2). Hidden from screen readers. */
export function Skeleton({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-border/70", className)}
      {...props}
    />
  );
}
