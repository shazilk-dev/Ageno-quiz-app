"use client";

import { Alert, Input, Select, SegmentedControl } from "@/components/ui";
import type { ImportMode } from "@/lib/quiz-import/apply";
import { LEVEL_LABELS, LIMITS, type AdminQuizDetail, type AdminQuizSummary, type Level } from "@/lib/quiz-schema";
import type { ImportPlan } from "./plan";
import type { ImportSession } from "./useImportSession";

export type TargetKind = "new" | "existing";

export const MODE_OPTIONS: { value: ImportMode; label: string; description: string }[] = [
  { value: "add", label: "Add", description: "after what is there" },
  { value: "replace", label: "Replace", description: "the level with the file" },
  { value: "update", label: "Update", description: "by question id" },
];

export const MODE_HELP: Record<ImportMode, string> = {
  add: "The questions are added after the ones already in each level. Ids in the file are ignored.",
  replace: "Each level in the file becomes exactly what the file holds. Questions that aren't in it are removed.",
  update:
    "Questions with an id from this quiz (a file exported from it) are changed in place. Questions without one are added. Nothing is removed.",
};

interface TargetStepProps {
  session: ImportSession;
  kind: TargetKind;
  onKind: (kind: TargetKind) => void;
  openNow: boolean;
  onOpenNow: (open: boolean) => void;
  quizzes: AdminQuizSummary[] | null;
  quizzesError: string | null;
  pickedId: string;
  onPick: (id: string) => void;
  detail: AdminQuizDetail | null;
  loadingDetail: boolean;
  detailError: string | null;
  mode: ImportMode;
  onMode: (mode: ImportMode) => void;
  plan: ImportPlan | null;
}

/** Step 3: a new quiz, or one you already have; then the plan in numbers. */
export function TargetStep(props: TargetStepProps) {
  const { session, kind, onKind, plan } = props;
  const { form, dispatch } = session;
  const levelsInFile = (Object.keys(session.ready) as Level[]).sort();

  return (
    <div className="space-y-8">
      <SegmentedControl<TargetKind>
        label="Where should the questions go?"
        value={kind}
        onChange={onKind}
        options={[
          { value: "new", label: "A new quiz" },
          { value: "existing", label: "A quiz I have" },
        ]}
      />

      {kind === "new" ? (
        <section aria-labelledby="new-quiz-heading" className="space-y-4">
          <h2 id="new-quiz-heading" className="text-xl">
            The new quiz
          </h2>
          <Input
            label="Title"
            required
            value={form.title}
            maxLength={LIMITS.title}
            onChange={(event) => dispatch({ type: "field", name: "title", value: event.target.value })}
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(event) => dispatch({ type: "field", name: "description", value: event.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {levelsInFile.map((level) => (
              <fieldset key={level} className="grid grid-cols-2 gap-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-label">{LEVEL_LABELS[level]}</legend>
                <Input
                  label="Minutes"
                  type="number"
                  inputMode="numeric"
                  min={LIMITS.minMinutes}
                  max={LIMITS.maxMinutes}
                  value={form.levels[level].duration}
                  onChange={(event) =>
                    dispatch({ type: "levelField", level, name: "duration", value: event.target.value })
                  }
                />
                <Input
                  label="Multiplier"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={LIMITS.minMultiplier}
                  max={LIMITS.maxMultiplier}
                  value={form.levels[level].pointsMultiplier}
                  onChange={(event) =>
                    dispatch({ type: "levelField", level, name: "pointsMultiplier", value: event.target.value })
                  }
                />
              </fieldset>
            ))}
          </div>
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              checked={props.openNow}
              onChange={(event) => props.onOpenNow(event.target.checked)}
              className="mt-1 size-5 accent-[var(--color-teal)]"
            />
            <span>
              Open it to players right away
              <span className="block text-sm text-text-muted">
                Off by default: the quiz is made closed, so you can read it through first. An access code is made for it
                either way. You can set the rest (access, listing, exam mode) in the editor afterwards.
              </span>
            </span>
          </label>
        </section>
      ) : (
        <section aria-labelledby="existing-heading" className="space-y-4">
          <h2 id="existing-heading" className="text-xl">
            The quiz to change
          </h2>
          {props.quizzesError && <Alert variant="error">{props.quizzesError}</Alert>}
          <Select
            label="Quiz"
            value={props.pickedId}
            disabled={props.quizzes === null}
            onChange={(event) => props.onPick(event.target.value)}
            wrapperClassName="max-w-lg"
          >
            <option value="">{props.quizzes === null && !props.quizzesError ? "Loading quizzes..." : "Choose a quiz"}</option>
            {props.quizzes
              ?.filter((quiz) => quiz.deletedAt === null)
              .map((quiz) => (
                <option key={quiz.id} value={quiz.id}>
                  {quiz.title}
                </option>
              ))}
          </Select>
          {props.loadingDetail && <p className="text-text-muted" role="status">Opening the quiz...</p>}
          {props.detailError && <Alert variant="error">{props.detailError}</Alert>}
          {props.detail && (
            <>
              <SegmentedControl<ImportMode>
                label="What should happen to the levels in the file?"
                value={props.mode}
                onChange={props.onMode}
                options={MODE_OPTIONS}
              />
              <p className="max-w-[65ch] text-sm text-text-muted">{MODE_HELP[props.mode]}</p>
              {props.detail.responseCount > 0 && props.mode === "replace" && (
                <Alert variant="warning">
                  This quiz already has {props.detail.responseCount}{" "}
                  {props.detail.responseCount === 1 ? "result" : "results"}. They are kept, and so are the answers people
                  gave, but the questions they saw will no longer be in the quiz.
                </Alert>
              )}
            </>
          )}
        </section>
      )}

      {plan && plan.levels.length > 0 && (
        <section aria-labelledby="plan-heading" className="space-y-3">
          <h2 id="plan-heading" className="text-xl">
            What will happen
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {plan.levels.map((entry) => (
              <li key={entry.level} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                <span className="font-medium">{LEVEL_LABELS[entry.level]}</span>
                <span className="font-mono text-sm text-text-muted">
                  {entry.text} · {entry.before} → {entry.after} questions
                </span>
              </li>
            ))}
          </ul>
          {plan.problems.length > 0 && (
            <Alert variant="error" title="This can't be saved yet">
              <ul className="list-disc space-y-1 pl-5">
                {plan.problems.slice(0, 5).map((issue, index) => (
                  <li key={index}>{issue.message}</li>
                ))}
              </ul>
            </Alert>
          )}
        </section>
      )}
    </div>
  );
}
