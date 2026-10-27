"use client";

import { useEffect, useId, useRef } from "react";
import { getOptionText } from "@/lib/exam/answers";
import type { ExamQuestion } from "@/lib/exam/types";
import { cn } from "@/lib/utils";

interface QuestionViewProps {
  question: ExamQuestion;
  /** 1-based, for the heading read by screen readers. */
  position: number;
  total: number;
  /** The picked option positions (`[]` while unanswered). */
  selected: number[];
  /** Pick an option: swaps the answer of a single-answer question, toggles one of a select-all question. */
  onSelect: (option: number) => void;
  onClear: () => void;
}

const letter = (index: number) => String.fromCharCode(65 + index);

/**
 * One question and its options. A single-answer question has native radios in a `radiogroup`, so Tab, Up
 * and Down and screen readers work without extra code; a select-all question has native checkboxes in a
 * `group`, with a line saying how many to choose. Left and Right are taken by the shell (previous and
 * next question). Mount it with `key={question.id}`: it moves focus to the heading each time.
 */
export default function QuestionView({
  question,
  position,
  total,
  selected,
  onSelect,
  onClear,
}: QuestionViewProps) {
  const groupName = useId();
  const headingId = useId();
  const hintId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const options = question.options ?? [];
  const multiple = question.type === "multiple";
  const instruction = multiple
    ? question.pickCount
      ? `Select all that apply · Choose ${question.pickCount}`
      : "Select all that apply"
    : null;

  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="w-fit max-w-[68ch] scroll-mt-20 whitespace-pre-line font-sans font-medium text-lg text-text leading-[1.45] tracking-normal focus:outline-none lg:text-xl"
      >
        <span className="sr-only">
          Question {position} of {total}:{" "}
        </span>
        {question.text}
      </h2>

      {instruction && (
        <p id={hintId} className="mt-1.5 font-mono text-text-muted text-xs">
          {instruction}
        </p>
      )}

      {question.imageUrl && (
        // Admin-uploaded Firebase Storage image of unknown size; next/image would need fixed dimensions.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={question.imageUrl}
          alt="Illustration for this question"
          className="mt-3 max-h-56 w-auto max-w-full rounded-md border border-border"
        />
      )}

      {options.length === 0 ? (
        <p className="mt-4 rounded-md border border-border bg-surface px-4 py-3 text-text-muted">
          This question has no answer options. Skip it, or flag it for review.
        </p>
      ) : (
        <div
          role={multiple ? "group" : "radiogroup"}
          aria-labelledby={headingId}
          aria-describedby={instruction ? hintId : undefined}
          className="mt-4 space-y-2"
        >
          {options.map((option, index) => {
            const checked = selected.includes(index);
            return (
              <label key={index} className="block">
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={groupName}
                  checked={checked}
                  onChange={() => onSelect(index)}
                  aria-keyshortcuts={`${index + 1} ${letter(index)}`}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-fast",
                    "hover:border-text-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                    checked
                      ? "border-2 border-accent bg-accent-soft px-[calc(0.75rem-1px)] py-[calc(0.5rem-1px)]"
                      : "border-control-border bg-surface"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-px grid size-6 shrink-0 place-items-center border font-mono text-xs transition-fast",
                      multiple ? "rounded-sm" : "rounded-full",
                      checked
                        ? "border-accent bg-accent text-ink"
                        : "border-control-border text-text-muted"
                    )}
                  >
                    {letter(index)}
                  </span>
                  <span className="min-w-0 whitespace-pre-line text-base text-text-body leading-[1.4] [overflow-wrap:anywhere]">
                    {getOptionText(option, index)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex min-h-9 items-center justify-between gap-4">
        <p className="hidden font-mono text-text-muted text-xs md:block">
          1–{Math.min(options.length, 9) || 1} or A–
          {letter(Math.max(0, Math.min(options.length, 26) - 1))}{" "}
          {multiple ? "to toggle" : "to answer"} · ← → to move
        </p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto inline-flex min-h-9 items-center rounded-md px-3 text-sm text-text-muted underline-offset-4 transition-fast hover:text-text hover:underline"
          >
            Clear answer
          </button>
        )}
      </div>
    </section>
  );
}
