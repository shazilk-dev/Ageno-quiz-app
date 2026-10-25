"use client";

import { LayoutGrid } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui";
import ExamTimer from "./ExamTimer";

interface ExamTopBarProps {
  title: string;
  /** 1-based. */
  position: number;
  total: number;
  answered: number;
  deadline: number;
  durationSec: number;
  onExpire: () => void;
  onSubmit: () => void;
  onOpenQuestions: () => void;
}

/**
 * The whole exam chrome: quiz title, the clock, Submit, and underneath "Q 5 of 20" with a progress bar.
 * It replaces the site header while an attempt runs. The bar moves with transform, not width.
 */
export default function ExamTopBar({
  title,
  position,
  total,
  answered,
  deadline,
  durationSec,
  onExpire,
  onSubmit,
  onOpenQuestions,
}: ExamTopBarProps) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-ink/95 backdrop-blur-md">
      <Container className="flex h-14 items-center gap-3 sm:gap-4">
        <h1 className="min-w-0 flex-1 truncate font-medium text-base tracking-normal">
          {title}
        </h1>
        <ExamTimer
          deadline={deadline}
          totalSeconds={durationSec}
          onExpire={onExpire}
        />
        <Button variant="secondary" size="sm" onClick={onSubmit}>
          Submit
        </Button>
      </Container>

      <Container className="flex h-11 items-center gap-4">
        <p className="shrink-0 font-mono text-sm text-text-muted tabular-nums">
          Q {position} of {total}
        </p>
        <div
          role="progressbar"
          aria-label="Progress through the questions"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={position}
          aria-valuetext={`Question ${position} of ${total}`}
          className="h-1 flex-1 overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full origin-left bg-accent transition-transform duration-200"
            style={{ transform: `scaleX(${position / Math.max(1, total)})` }}
          />
        </div>
        <button
          type="button"
          onClick={onOpenQuestions}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 font-mono text-sm text-text-muted tabular-nums transition-fast hover:text-text lg:hidden"
        >
          <LayoutGrid className="size-4" aria-hidden="true" />
          <span className="sr-only">Questions: </span>
          {answered}/{total}
        </button>
      </Container>
    </div>
  );
}
