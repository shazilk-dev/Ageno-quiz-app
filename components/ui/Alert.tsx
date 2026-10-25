import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "info" | "success" | "warning" | "error";

interface AlertProps {
  variant?: Variant;
  title?: string;
  children?: ReactNode;
  /** A button or link, e.g. Retry. */
  action?: ReactNode;
  className?: string;
}

const variantStyles: Record<
  Variant,
  { bar: string; icon: string; Icon: typeof Info }
> = {
  info: { bar: "border-l-accent", icon: "text-accent", Icon: Info },
  success: {
    bar: "border-l-success",
    icon: "text-success",
    Icon: CircleCheck,
  },
  warning: {
    bar: "border-l-warning",
    icon: "text-warning",
    Icon: TriangleAlert,
  },
  error: { bar: "border-l-error", icon: "text-error", Icon: CircleAlert },
};

/** Inline message. Errors and warnings are announced at once (role="alert"); the rest politely (role="status"). */
export function Alert({
  variant = "info",
  title,
  children,
  action,
  className,
}: AlertProps) {
  const { bar, icon, Icon } = variantStyles[variant];
  const urgent = variant === "error" || variant === "warning";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border border-l-4 bg-surface py-3 pr-3 pl-4 text-text",
        bar,
        className
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium leading-snug">{title}</p>}
        {children && (
          <div className={cn("text-sm text-text-body", title && "mt-1")}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
