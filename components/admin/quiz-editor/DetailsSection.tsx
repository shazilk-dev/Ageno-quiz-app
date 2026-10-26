"use client";

import { RefreshCw } from "lucide-react";
import type { Dispatch, ReactNode } from "react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { LIMITS, makeAccessCode, type ValidationIssue } from "@/lib/quiz-schema";
import type { EditorAction, FormState } from "./editor-state";

interface DetailsSectionProps {
  form: FormState;
  /** Problems with the quiz as a whole (not with one question). */
  issues: ValidationIssue[];
  dispatch: Dispatch<EditorAction>;
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-3 size-5 shrink-0 accent-[var(--color-teal)]"
      />
      <label htmlFor={id} className="min-h-11 py-2.5">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-sm text-text-muted">{hint}</span>}
      </label>
    </div>
  );
}

const randomBelow = (max: number) => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
};

const issueFor = (issues: ValidationIssue[], pattern: RegExp) =>
  issues.find((issue) => pattern.test(issue.message))?.message;

/** Title, access, visibility and marking: everything about the quiz that isn't a question. */
export function DetailsSection({ form, issues, dispatch }: DetailsSectionProps) {
  const field =
    (name: "title" | "description" | "duration" | "accessCode") =>
    (event: { target: { value: string } }) =>
      dispatch({ type: "field", name, value: event.target.value });
  const toggle = (name: "requiresAccessCode" | "isPublic" | "active" | "isAutoCheck" | "showAnswerReview") =>
    (value: boolean) => dispatch({ type: "field", name, value });

  return (
    <section aria-labelledby="details-heading" className="space-y-6">
      <h2 id="details-heading" className="text-xl">
        Quiz details
      </h2>

      <Input
        label="Title"
        required
        value={form.title}
        maxLength={LIMITS.title}
        onChange={field("title")}
        error={issueFor(issues, /title/i)}
      />
      <Textarea
        label="Description"
        value={form.description}
        onChange={field("description")}
        className="min-h-24"
        hint="Shown to players in the list and the lobby."
        error={issueFor(issues, /description/i)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Default time limit (minutes)"
          type="number"
          inputMode="numeric"
          min={LIMITS.minMinutes}
          max={LIMITS.maxMinutes}
          value={form.duration}
          onChange={field("duration")}
          hint="A level can set its own below."
          error={issueFor(issues, /default time limit/i)}
        />
        <div>
          <Input
            label="Access code"
            value={form.accessCode}
            onChange={(event) =>
              dispatch({ type: "field", name: "accessCode", value: event.target.value.toUpperCase() })
            }
            className="font-mono uppercase tracking-[0.1em]"
            placeholder="Leave blank to make one"
            autoComplete="off"
            spellCheck={false}
            error={issueFor(issues, /access code/i)}
          />
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() =>
              dispatch({
                type: "field",
                name: "accessCode",
                value: makeAccessCode(randomBelow),
              })
            }
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Make a new code
          </Button>
        </div>
      </div>

      <fieldset className="space-y-1">
        <legend className="mb-2 text-sm font-medium text-text-muted">Who can take it</legend>
        <Toggle
          id="requiresAccessCode"
          label="Players must enter the access code to start"
          checked={form.requiresAccessCode}
          onChange={toggle("requiresAccessCode")}
        />
        <Toggle
          id="isPublic"
          label="Listed on the Join page"
          hint="Off keeps it out of the list. People with the link or code can still open it."
          checked={form.isPublic}
          onChange={toggle("isPublic")}
        />
        <Toggle
          id="active"
          label="Open for attempts"
          hint="Off shows players that the quiz isn't open right now."
          checked={form.active}
          onChange={toggle("active")}
        />
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-2 text-sm font-medium text-text-muted">Marking</legend>
        <Toggle
          id="isAutoCheck"
          label="Mark answers automatically"
          hint="Off collects answers without a score or review."
          checked={form.isAutoCheck}
          onChange={toggle("isAutoCheck")}
        />
        <Toggle
          id="showAnswerReview"
          label="Show the answer review after submitting"
          hint="Players see each question with the correct answer."
          checked={form.showAnswerReview}
          onChange={toggle("showAnswerReview")}
        />
      </fieldset>

      <Select
        label="Exam mode"
        value={form.examMode}
        onChange={(event) =>
          dispatch({ type: "field", name: "examMode", value: event.target.value })
        }
        hint={
          form.examMode === "strict"
            ? "Leaving fullscreen pauses the questions and is recorded."
            : "Fullscreen is offered; leaving it is fine."
        }
        error={issueFor(issues, /exam mode/i)}
      >
        <option value="practice">Practice</option>
        <option value="strict">Strict</option>
      </Select>
    </section>
  );
}
