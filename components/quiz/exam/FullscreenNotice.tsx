"use client";

import { Maximize } from "lucide-react";
import { Container } from "@/components/layout/Container";

interface FullscreenNoticeProps {
  onReturn: () => void;
  onDismiss: () => void;
}

/** Practice quizzes: a quiet one-line offer to go back to fullscreen. Nothing is blocked or recorded. */
export default function FullscreenNotice({
  onReturn,
  onDismiss,
}: FullscreenNoticeProps) {
  return (
    <div role="status" className="border-b border-border bg-surface">
      <Container className="flex min-h-11 items-center gap-3 text-sm">
        <Maximize
          className="size-4 shrink-0 text-text-muted"
          aria-hidden="true"
        />
        <p className="min-w-0 flex-1 text-text-body">
          You&apos;ve left fullscreen.
          <span className="max-sm:hidden"> That&apos;s fine for practice.</span>
        </p>
        <button
          type="button"
          onClick={onReturn}
          className="inline-flex min-h-11 items-center px-2 text-link underline underline-offset-4 hover:no-underline"
        >
          <span>
            Return<span className="max-sm:sr-only"> to fullscreen</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-11 items-center px-2 text-text-muted transition-fast hover:text-text"
        >
          Dismiss
        </button>
      </Container>
    </div>
  );
}
