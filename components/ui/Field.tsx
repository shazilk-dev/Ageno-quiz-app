import { ChevronDown, CircleAlert } from "lucide-react";
import { type ComponentPropsWithRef, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Label, control slot and the error / hint line. Errors announce themselves via aria-describedby on the control. */
function FieldShell({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block font-medium text-sm">
        {label}
        {required && (
          <span className="ml-0.5 text-text-muted" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {(error || hint) && (
        <div className="mt-2 flex items-start justify-between gap-4 text-sm">
          {error ? (
            <p
              id={`${id}-error`}
              className="flex items-start gap-1.5 text-error"
            >
              <CircleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {error}
            </p>
          ) : (
            <span />
          )}
          {hint && <span className="shrink-0 text-text-muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}

const controlStyles =
  "w-full rounded-md border bg-surface px-4 text-base text-text transition-fast placeholder:text-text-faint hover:border-text-muted focus-visible:border-accent disabled:opacity-60";

const stateStyles = (error?: string) =>
  error ? "border-error" : "border-control-border";

interface BaseProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  wrapperClassName?: string;
}

interface InputProps
  extends BaseProps,
    Omit<ComponentPropsWithRef<"input">, "className"> {
  className?: string;
}

export function Input({
  label,
  error,
  hint,
  wrapperClassName,
  className,
  id: idProp,
  required,
  ...props
}: InputProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={wrapperClassName}
    >
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn("h-12", controlStyles, stateStyles(error), className)}
        {...props}
      />
    </FieldShell>
  );
}

interface TextareaProps
  extends BaseProps,
    Omit<ComponentPropsWithRef<"textarea">, "className"> {
  className?: string;
}

export function Textarea({
  label,
  error,
  hint,
  wrapperClassName,
  className,
  id: idProp,
  required,
  ...props
}: TextareaProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={wrapperClassName}
    >
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "min-h-40 resize-y py-3 leading-relaxed",
          controlStyles,
          stateStyles(error),
          className,
        )}
        {...props}
      />
    </FieldShell>
  );
}

interface SelectProps
  extends BaseProps,
    Omit<ComponentPropsWithRef<"select">, "className"> {
  className?: string;
}

/** Native <select>: best keyboard, screen reader and mobile picker behaviour, styled to match. */
export function Select({
  label,
  error,
  hint,
  wrapperClassName,
  className,
  id: idProp,
  required,
  children,
  ...props
}: SelectProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={wrapperClassName}
    >
      <div className="relative">
        <select
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "h-12 cursor-pointer appearance-none pr-11",
            controlStyles,
            stateStyles(error),
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
      </div>
    </FieldShell>
  );
}
