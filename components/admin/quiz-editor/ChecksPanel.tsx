"use client";

import { CircleCheck, ListChecks } from "lucide-react";
import { useDeferredValue, useMemo } from "react";
import { checkQuiz } from "@/lib/quiz-checks";
import { LEVELS, LEVEL_LABELS, type Level } from "@/lib/quiz-schema";
import type { FormState } from "./editor-state";

const MAX_SHOWN = 30;

interface ChecksPanelProps {
  form: FormState;
  /** Go to a question (or to the level, when `question` is undefined). */
  onJump: (level: Level, question?: number) => void;
}

/**
 * Things in the draft that are valid but look careless: repeated questions, an answer that is usually the
 * same letter, a time limit that leaves seconds per question. Advice only; it never blocks a save.
 */
export function ChecksPanel({ form, onJump }: ChecksPanelProps) {
  // Typing stays quick on a big quiz: the checks catch up a moment later.
  const levels = useDeferredValue(form.levels);
  const checks = useMemo(
    () =>
      checkQuiz({
        easy: { duration: Number(levels.easy.duration), questions: levels.easy.questions },
        medium: { duration: Number(levels.medium.duration), questions: levels.medium.questions },
        hard: { duration: Number(levels.hard.duration), questions: levels.hard.questions },
      }),
    [levels]
  );
  const total = LEVELS.reduce((sum, level) => sum + levels[level].questions.length, 0);
  if (total === 0) return null;

  const shown = checks.slice(0, MAX_SHOWN);

  return (
    <details className="group rounded-lg border border-border bg-surface">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-sm transition-fast hover:text-text">
        {checks.length === 0 ? (
          <CircleCheck className="size-4 text-success" aria-hidden="true" />
        ) : (
          <ListChecks className="size-4 text-link" aria-hidden="true" />
        )}
        <span className="font-medium">Checks</span>
        <span className="font-mono text-text-muted" role="status">
          {checks.length === 0 ? "nothing to look at" : `${checks.length} to look at`}
        </span>
      </summary>
      <div className="border-t border-border px-4 py-3">
        {checks.length === 0 ? (
          <p className="text-sm text-text-muted">
            No repeated questions, no pattern in the answers, no missing explanations.
          </p>
        ) : (
          <>
            <p className="mb-3 max-w-[65ch] text-sm text-text-muted">
              Your quiz can be saved as it is. These are things that often turn out to be slips.
            </p>
            <ul className="space-y-1">
              {shown.map((check, index) => {
                const first = check.questions[0];
                const place =
                  first === undefined
                    ? `${LEVEL_LABELS[check.level]} level`
                    : check.questions.length === 1
                      ? `${LEVEL_LABELS[check.level]} · Question ${first + 1}`
                      : `${LEVEL_LABELS[check.level]} · from Question ${first + 1}`;
                return (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => onJump(check.level, first)}
                      className="flex min-h-11 w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-fast hover:bg-bg-alt sm:flex-row sm:items-baseline sm:gap-3"
                    >
                      <span className="shrink-0 font-mono text-sm text-text-muted sm:w-44">{place}</span>
                      <span className="text-sm">{check.message}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {checks.length > shown.length && (
              <p className="mt-2 text-sm text-text-muted">and {checks.length - shown.length} more.</p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
