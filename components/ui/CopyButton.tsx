"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  /** Text placed on the clipboard. */
  text: string;
  /** Accessible name, e.g. "Copy code". */
  label?: string;
  className?: string;
}

/** Copies `text` and confirms in place for 2s (visible label + polite live region). */
export function CopyButton({
  text,
  label = "Copy",
  className,
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  const Icon = state === "copied" ? Check : Copy;

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-md px-3 print:hidden font-medium font-mono text-text-muted text-xs uppercase tracking-[0.05em] transition-fast hover:text-text",
        state === "copied" && "text-link hover:text-link",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span aria-hidden="true">
        {state === "copied" ? "Copied" : state === "failed" ? "Failed" : label}
      </span>
      <span className="sr-only" role="status">
        {state === "copied"
          ? "Copied to clipboard"
          : state === "failed"
            ? "Copy failed"
            : label}
      </span>
    </button>
  );
}
