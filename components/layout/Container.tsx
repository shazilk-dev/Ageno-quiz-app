import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/** Centred column, 1200px max, with a 16px gutter on phones. */
export function Container({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-(--max-width) px-4 sm:px-6", className)}
      {...props}
    />
  );
}
