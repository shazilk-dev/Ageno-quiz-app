import { LoaderCircle } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "warm" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Style the single child element (e.g. a `<Link>`) instead of rendering a `<button>`. */
  asChild?: boolean;
  loading?: boolean;
  className?: string;
}

const variantStyles: Record<Variant, string> = {
  // Ink on teal keeps AA contrast; bone on teal does not.
  primary: "bg-teal text-ink hover:brightness-110",
  secondary: "border border-accent text-link hover:bg-accent/10",
  // Amber is reserved for community moments (a leaderboard highlight, a "Rise together" call to action).
  warm: "bg-warm text-ink hover:brightness-110",
  ghost: "text-text-muted hover:bg-surface hover:text-text",
  // Outlined so it reads on both the dark and the bone theme.
  danger: "border border-error text-error hover:bg-error/10",
};

const sizeStyles: Record<Size, string> = {
  // The pill stays compact; the ::after grows the tap area to 44px (WCAG 2.5.8) without changing the look.
  sm: "relative h-8 px-3 text-sm after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
  md: "h-11 px-5 text-base",
  lg: "h-12 px-6 text-lg",
};

/** Teal is the system: one primary action per view. No hover scale; buttons brighten instead. */
export function Button({
  variant = "primary",
  size = "md",
  asChild = false,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-fast",
    "active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    variantStyles[variant],
    sizeStyles[size],
    className
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, {
      className: cn(classes, child.props.className),
      ...(disabled || loading ? { "aria-disabled": true } : {}),
    } as Partial<{ className: string }>);
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
      {...props}
    >
      {loading && (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
