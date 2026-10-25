"use client";

import { Flag } from "lucide-react";
import type { AnswerMap, FlagMap } from "@/lib/exam/answers";
import type { ExamQuestion } from "@/lib/exam/types";
import { cn } from "@/lib/utils";

interface QuestionNavigatorProps {
  questions: ExamQuestion[];
  answers: AnswerMap;
  flagged: FlagMap;
  current: number;
  onSelect: (index: number) => void;
}

/**
 * A numbered grid of every question: current, answered, unanswered and flagged. State is shown by
 * fill, outline and a flag icon, and spelled out in each button's label, not by colour alone.
 */
export default function QuestionNavigator({
  questions,
  answers,
  flagged,
  current,
  onSelect,
}: QuestionNavigatorProps) {
  const answered = questions.filter(
    (question) => answers[question.id] !== null && answers[question.id] !== undefined
  ).length;

  return (
    <div>
      <p className="font-mono text-sm tabular-nums text-text-muted">
        {answered} of {questions.length} answered
      </p>

      <ol className="mt-4 grid grid-cols-5 gap-2">
        {questions.map((question, index) => {
          const isCurrent = index === current;
          const isAnswered =
            answers[question.id] !== null && answers[question.id] !== undefined;
          const isFlagged = !!flagged[question.id];
          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Question ${index + 1}, ${
                  isAnswered ? "answered" : "not answered"
                }${isFlagged ? ", flagged for review" : ""}`}
                className={cn(
                  "relative grid size-11 place-items-center rounded-md border font-mono text-sm tabular-nums transition-fast",
                  isCurrent
                    ? "border-accent bg-accent text-ink"
                    : isAnswered
                      ? "border-accent/50 bg-accent/15 text-text hover:border-accent"
                      : "border-border text-text-muted hover:border-border-strong hover:text-text"
                )}
              >
                {index + 1}
                {isFlagged && (
                  <Flag
                    aria-hidden="true"
                    className={cn(
                      "absolute top-1 right-1 size-3 fill-current",
                      isCurrent ? "text-ink" : "text-text"
                    )}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <ul
        aria-hidden="true"
        className="mt-5 grid grid-cols-2 gap-x-3 gap-y-2 text-text-muted text-xs"
      >
        <LegendItem swatch="border-accent bg-accent" label="Current" />
        <LegendItem swatch="border-accent/50 bg-accent/15" label="Answered" />
        <LegendItem swatch="border-border" label="Not answered" />
        <li className="flex items-center gap-2">
          <Flag className="size-3.5 fill-current text-text" />
          Flagged
        </li>
      </ul>
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("size-3.5 rounded-sm border", swatch)} />
      {label}
    </li>
  );
}
