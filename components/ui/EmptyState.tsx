import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  /** A plain icon, no coloured circle behind it. */
  icon?: LucideIcon;
  /** A button or link: the next sensible step (clear the search, create a quiz). */
  action?: ReactNode;
  className?: string;
}

/** Designed "nothing here" panel for lists. Say what's missing and what to do next, in plain words. */
export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border border-dashed px-6 py-10 sm:px-10",
        className
      )}
    >
      {Icon && (
        <Icon className="mb-4 size-6 text-text-muted" aria-hidden="true" />
      )}
      <h2 className="text-xl">{title}</h2>
      {description && (
        <p className="mt-2 max-w-[65ch] text-text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
