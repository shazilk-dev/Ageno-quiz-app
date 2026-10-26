"use client";

import { ChevronDown, ChevronUp, Copy, Eye, Plus, Trash2, X } from "lucide-react";
import { useState, type Dispatch } from "react";
import { Alert, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Level, QuestionType } from "@/lib/quiz-schema";
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  newKey,
  type DraftQuestion,
  type EditorAction,
} from "./editor-state";
import { PreviewReview } from "./PreviewReview";

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

const letter = (index: number) => String.fromCharCode(65 + index);

const TYPE_CHOICES: { value: QuestionType; label: string }[] = [
  { value: "single", label: "One correct answer" },
  { value: "multiple", label: "Select all that apply" },
];

/**
 * One question: its type, text, options (mark the right ones), a reason for each option if wanted, and
 * the optional overall explanation and image.
 */
export function QuestionCard({ level, question, index, total, problem, dispatch }: QuestionCardProps) {
  const { key } = question;
  const baseId = `question-${key}`;
  const hasExtras = Boolean(question.explanation || question.imageUrl);
  const multiple = question.type === "multiple";
  const rightOptions = question.options.flatMap((option, i) => (option.isCorrect ? [i] : []));
  const reasons = question.options.filter((option) => option.rationale?.trim()).length;
  // Going from select-all to one answer with several marked right: ask which one stays.
  const [choosingKeep, setChoosingKeep] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const chooseType = (next: QuestionType) => {
    if (next === question.type) return;
    if (next === "single" && rightOptions.length > 1) {
      setChoosingKeep(true);
      return;
    }
    dispatch({ type: "setType", level, key, questionType: next });
  };

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
          <IconButton label={`Preview the review of question ${index + 1}`} onClick={() => setPreviewing(true)}>
            <Eye className="size-4" aria-hidden="true" />
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
          <legend className="mb-2 text-sm font-medium">Question type</legend>
          <div className="inline-flex flex-wrap gap-2">
            {TYPE_CHOICES.map((choice) => (
              <label key={choice.value} className="cursor-pointer">
                <input
                  type="radio"
                  name={`${baseId}-type`}
                  value={choice.value}
                  checked={question.type === choice.value}
                  onChange={() => chooseType(choice.value)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-md border px-3 text-sm transition-fast",
                    "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                    question.type === choice.value
                      ? "border-accent bg-accent/10 text-text"
                      : "border-border text-text-muted hover:border-border-strong hover:text-text"
                  )}
                >
                  {choice.label}
                </span>
              </label>
            ))}
          </div>
          {choosingKeep && (
            <Alert variant="warning" className="mt-3">
              <p>
                {rightOptions.length} options are marked correct, and a one-answer question has one. Which
                one stays correct?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {rightOptions.map((optionIndex) => (
                  <Button
                    key={optionIndex}
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      dispatch({ type: "setType", level, key, questionType: "single", keep: optionIndex });
                      setChoosingKeep(false);
                    }}
                  >
                    Keep {letter(optionIndex)}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setChoosingKeep(false)}>
                  Cancel
                </Button>
              </div>
            </Alert>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Answer options
            <span className="ml-2 font-normal text-text-muted">
              {multiple ? "Tick every correct option." : "Select the correct one."}
            </span>
          </legend>
          <div className="space-y-2">
            {question.options.map((option, optionIndex) => (
              <div key={optionIndex} className="flex items-center gap-2">
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={`${baseId}-correct`}
                  checked={option.isCorrect}
                  onChange={() =>
                    dispatch({
                      type: multiple ? "toggleCorrect" : "setCorrect",
                      level,
                      key,
                      index: optionIndex,
                    })
                  }
                  aria-label={`Option ${optionIndex + 1} is ${multiple ? "a" : "the"} correct answer`}
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

        <details open={reasons > 0} className="group">
          <summary className="cursor-pointer text-sm text-text-muted transition-fast hover:text-text">
            Add a reason for each option (optional)
            <span className="ml-2 font-mono text-xs">
              {reasons} of {question.options.length} written
            </span>
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-text-muted">
              Players see the reason under a right option, and under a wrong one they picked. The other
              reasons are folded away in their review.
            </p>
            {question.options.map((option, optionIndex) => (
              <div key={optionIndex}>
                <label
                  htmlFor={`${baseId}-why-${optionIndex}`}
                  className="mb-1 block text-sm font-medium"
                >
                  Why option {letter(optionIndex)} is {option.isCorrect ? "right" : "wrong"}
                </label>
                <textarea
                  id={`${baseId}-why-${optionIndex}`}
                  value={option.rationale ?? ""}
                  rows={2}
                  onChange={(event) =>
                    dispatch({
                      type: "optionRationale",
                      level,
                      key,
                      index: optionIndex,
                      value: event.target.value,
                    })
                  }
                  className={cn(fieldClasses, "min-h-16 resize-y py-2 leading-relaxed")}
                />
              </div>
            ))}
          </div>
        </details>

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
      <PreviewReview question={question} open={previewing} onClose={() => setPreviewing(false)} />
    </li>
  );
}
