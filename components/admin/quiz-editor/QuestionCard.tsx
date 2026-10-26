"use client";

import { ChevronDown, ChevronUp, Copy, Plus, Trash2, X } from "lucide-react";
import type { Dispatch } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Level } from "@/lib/quiz-schema";
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  newKey,
  type DraftQuestion,
  type EditorAction,
} from "./editor-state";

interface QuestionCardProps {
  level: Level;
  question: DraftQuestion;
  index: number;
  total: number;
  /** The first thing wrong with this question, from the last failed save. */
  problem?: string;
  dispatch: Dispatch<EditorAction>;
}

const fieldClasses =
  "w-full rounded-md border border-border bg-surface px-3 text-text transition-fast placeholder:text-text-muted/70 hover:border-border-strong focus-visible:border-accent";

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-md text-text-muted transition-fast hover:bg-bg-alt hover:text-text disabled:pointer-events-none disabled:opacity-40",
        danger && "hover:text-error"
      )}
    >
      {children}
    </button>
  );
}

/** One question: its text, its options (pick the right one), and the optional explanation and image. */
export function QuestionCard({ level, question, index, total, problem, dispatch }: QuestionCardProps) {
  const { key } = question;
  const baseId = `question-${key}`;
  const hasExtras = Boolean(question.explanation || question.imageUrl);

  return (
    <li
      id={baseId}
      className={cn(
        "rounded-lg border bg-surface",
        problem ? "border-error" : "border-border"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-1">
        <h3 className="font-mono text-sm uppercase tracking-[0.05em] text-text-muted">
          Question {index + 1}
        </h3>
        <div className="-mr-2 flex">
          <IconButton
            label={`Move question ${index + 1} up`}
            disabled={index === 0}
            onClick={() => dispatch({ type: "moveQuestion", level, key, by: -1 })}
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label={`Move question ${index + 1} down`}
            disabled={index === total - 1}
            onClick={() => dispatch({ type: "moveQuestion", level, key, by: 1 })}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label={`Duplicate question ${index + 1}`}
            onClick={() => dispatch({ type: "duplicateQuestion", level, key, newKey: newKey() })}
          >
            <Copy className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label={`Delete question ${index + 1}`}
            danger
            onClick={() => dispatch({ type: "removeQuestion", level, key })}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {problem && (
          <p role="alert" className="text-sm text-error">
            {problem}
          </p>
        )}

        <div>
          <label htmlFor={`${baseId}-text`} className="mb-2 block text-sm font-medium">
            Question
          </label>
          <textarea
            id={`${baseId}-text`}
            value={question.text}
            rows={2}
            onChange={(event) =>
              dispatch({ type: "editQuestion", level, key, patch: { text: event.target.value } })
            }
            className={cn(fieldClasses, "min-h-20 resize-y py-2 leading-relaxed")}
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Answer options
            <span className="ml-2 font-normal text-text-muted">Select the correct one.</span>
          </legend>
          <div className="space-y-2">
            {question.options.map((option, optionIndex) => (
              <div key={optionIndex} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${baseId}-correct`}
                  checked={option.isCorrect}
                  onChange={() => dispatch({ type: "setCorrect", level, key, index: optionIndex })}
                  aria-label={`Option ${optionIndex + 1} is the correct answer`}
                  className="size-5 shrink-0 accent-[var(--color-teal)]"
                />
                <input
                  type="text"
                  value={option.text}
                  onChange={(event) =>
                    dispatch({
                      type: "optionText",
                      level,
                      key,
                      index: optionIndex,
                      value: event.target.value,
                    })
                  }
                  aria-label={`Option ${optionIndex + 1}`}
                  placeholder={`Option ${optionIndex + 1}`}
                  className={cn(fieldClasses, "h-11")}
                />
                <IconButton
                  label={`Remove option ${optionIndex + 1}`}
                  disabled={question.options.length <= MIN_OPTIONS}
                  onClick={() => dispatch({ type: "removeOption", level, key, index: optionIndex })}
                >
                  <X className="size-4" aria-hidden="true" />
                </IconButton>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            disabled={question.options.length >= MAX_OPTIONS}
            onClick={() => dispatch({ type: "addOption", level, key })}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add option
          </Button>
        </fieldset>

        <details open={hasExtras} className="group">
          <summary className="cursor-pointer text-sm text-text-muted transition-fast hover:text-text">
            Explanation and image (optional)
          </summary>
          <div className="mt-3 space-y-4">
            <div>
              <label htmlFor={`${baseId}-explanation`} className="mb-2 block text-sm font-medium">
                Explanation
                <span className="ml-2 font-normal text-text-muted">Shown in the review after submitting.</span>
              </label>
              <textarea
                id={`${baseId}-explanation`}
                value={question.explanation ?? ""}
                rows={2}
                onChange={(event) =>
                  dispatch({ type: "editQuestion", level, key, patch: { explanation: event.target.value } })
                }
                className={cn(fieldClasses, "min-h-16 resize-y py-2 leading-relaxed")}
              />
            </div>
            <div>
              <label htmlFor={`${baseId}-image`} className="mb-2 block text-sm font-medium">
                Image link
                <span className="ml-2 font-normal text-text-muted">A full https:// address.</span>
              </label>
              <input
                id={`${baseId}-image`}
                type="url"
                inputMode="url"
                value={question.imageUrl ?? ""}
                onChange={(event) =>
                  dispatch({ type: "editQuestion", level, key, patch: { imageUrl: event.target.value } })
                }
                className={cn(fieldClasses, "h-11")}
              />
            </div>
          </div>
        </details>
      </div>
    </li>
  );
}
