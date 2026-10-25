"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type Variant = "success" | "error";

interface ToastInput {
  title: string;
  description?: string;
  variant?: Variant;
  /** Milliseconds before it dismisses itself. Default 5000. */
  duration?: number;
}

interface ToastItem
  extends Required<Pick<ToastInput, "title" | "variant" | "duration">> {
  id: number;
  description?: string;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;

/** Show a toast from any client component. Must be used under <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const variantStyles: Record<Variant, { bar: string; icon: string }> = {
  success: { bar: "border-l-success", icon: "text-success" },
  error: { bar: "border-l-error", icon: "text-error" },
};

function Toast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  // Hovering or focusing a toast pauses its timer so it can be read and acted on.
  const [paused, setPaused] = useState(false);
  const { id, duration } = item;

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [paused, id, duration, onDismiss]);

  const Icon = item.variant === "success" ? CircleCheck : CircleAlert;
  const styles = variantStyles[item.variant];

  return (
    <div
      data-theme="dark"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "animate-toast pointer-events-auto flex items-start gap-3 rounded-lg border border-border-strong border-l-4 bg-surface-raised py-3 pr-1 pl-4 text-text shadow-float",
        styles.bar,
      )}
    >
      <Icon
        className={cn("mt-0.5 size-5 shrink-0", styles.icon)}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="font-medium leading-snug">{item.title}</p>
        {item.description && (
          <p className="mt-1 text-sm text-text-muted">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted transition-fast hover:text-text"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Global notifications. Successes announce politely, errors assertively. Both regions stay mounted
 * (empty) so screen readers register them before the first toast arrives.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const item: ToastItem = {
      id: ++nextId.current,
      variant: "success",
      duration: 5000,
      ...input,
    };
    setItems((current) => [...current.slice(-(MAX_VISIBLE - 1)), item]);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96">
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          {items
            .filter((item) => item.variant === "success")
            .map((item) => (
              <Toast key={item.id} item={item} onDismiss={dismiss} />
            ))}
        </div>
        <div role="alert" aria-live="assertive" className="flex flex-col gap-3">
          {items
            .filter((item) => item.variant === "error")
            .map((item) => (
              <Toast key={item.id} item={item} onDismiss={dismiss} />
            ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
