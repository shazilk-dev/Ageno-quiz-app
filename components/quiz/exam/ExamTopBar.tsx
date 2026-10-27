"use client";

import { LayoutGrid } from "lucide-react";
import { Container } from "@/components/layout/Container";
import ThemeToggle from "@/components/layout/ThemeToggle";
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
 * The whole exam chrome in one row: quiz title, "Q 5 of 20", a progress bar, the clock and Submit.
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
    <div className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur-md">
      <Container className="flex h-14 items-center gap-3 sm:gap-4">
        {/* Phones have no room for the title next to the clock and Submit; it stays for screen readers. */}
        <h1 className="max-sm:sr-only min-w-0 flex-1 truncate font-medium text-base tracking-normal md:max-w-[16rem] md:flex-none lg:max-w-xs">
          {title}
        </h1>
        <p className="max-sm:flex-1 shrink-0 font-mono text-sm text-text-muted tabular-nums">
          Q {position} of {total}
        </p>
        {/* A slim line along the bar's lower edge on phones, a track in the middle of the row from md up. */}
        <div
          role="progressbar"
          aria-label="Progress through the questions"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={position}
          aria-valuetext={`Question ${position} of ${total}`}
          className="overflow-hidden bg-border max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:h-0.5 md:h-1 md:flex-1 md:rounded-full"
        >
          <div
            className="h-full origin-left bg-accent transition-transform duration-200"
            style={{ transform: `scaleX(${position / Math.max(1, total)})` }}
          />
        </div>
        <button
          type="button"
          onClick={onOpenQuestions}
          className="-mr-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 font-mono text-sm text-text-muted tabular-nums transition-fast hover:text-text lg:hidden"
        >
          <LayoutGrid className="size-4" aria-hidden="true" />
          <span className="sr-only">Questions: </span>
          {answered}/{total}
        </button>
        <ThemeToggle className="-mx-1 max-sm:hidden" />
        <ExamTimer
          deadline={deadline}
          totalSeconds={durationSec}
          onExpire={onExpire}
        />
        <Button variant="secondary" size="sm" onClick={onSubmit}>
          Submit
        </Button>
      </Container>
    </div>
  );
}
