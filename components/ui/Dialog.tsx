"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  /** Called on Escape, the close button and a click on the backdrop. */
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons, right-aligned under the content. */
  footer?: ReactNode;
  /** Set false for a decision the user must answer (no close button, backdrop or Escape). Default true. */
  dismissible?: boolean;
  className?: string;
}

/**
 * Modal built on the native <dialog>: showModal() traps focus, makes the rest of the page inert,
 * handles Escape and returns focus to the trigger on close.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-theme="dark"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Escape fires `cancel` first; for a non-dismissible dialog we swallow it.
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      // The <dialog> element is the backdrop hit area: a click that lands on it, not on the panel inside.
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border-strong bg-surface-raised p-0 text-text shadow-float",
        "backdrop:bg-ink/70",
        className
      )}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-3 grid size-11 shrink-0 place-items-center rounded-md text-text-muted transition-fast hover:text-text"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {description && (
          <p id={descriptionId} className="mt-2 text-text-body">
            {description}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && (
          <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div>
        )}
      </div>
    </dialog>
  );
}
