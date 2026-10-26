"use client";

import { Download, Plus, Upload } from "lucide-react";
import { type Dispatch, useState } from "react";
import { Button, EmptyState, FilterTabs, Input } from "@/components/ui";
import {
  LEVELS,
  LEVEL_LABELS,
  LIMITS,
  exportQuestions,
  type Level,
  type ValidationIssue,
} from "@/lib/quiz-schema";
import { ImportDialog } from "./ImportDialog";
import { QuestionCard } from "./QuestionCard";
import { newKey, type EditorAction, type FormState } from "./editor-state";

interface LevelsSectionProps {
  form: FormState;
  level: Level;
  onLevelChange: (level: Level) => void;
  issues: ValidationIssue[];
  dispatch: Dispatch<EditorAction>;
}

/** The first problem of each question in this level, by question index. */
function problemsByQuestion(issues: ValidationIssue[], level: Level) {
  const problems = new Map<number, string>();
  for (const issue of issues) {
    if (issue.level === level && issue.question !== undefined && !problems.has(issue.question)) {
      problems.set(issue.question, issue.message);
    }
  }
  return problems;
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** The three difficulty levels: a tab each, with that level's time limit, multiplier and questions. */
export function LevelsSection({ form, level, onLevelChange, issues, dispatch }: LevelsSectionProps) {
  const [importing, setImporting] = useState(false);
  const draft = form.levels[level];
  const problems = problemsByQuestion(issues, level);
  const levelIssue = issues.find((issue) => issue.level === level && issue.question === undefined);

  const exportLevel = () =>
    download(
      `${(form.title.trim() || "quiz").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${level}.json`,
      exportQuestions(draft.questions)
    );

  return (
    <section aria-labelledby="levels-heading" className="space-y-4">
      <div>
        <h2 id="levels-heading" className="text-xl">
          Questions
        </h2>
        <p className="mt-1 max-w-[65ch] text-text-muted">
          Players choose a level, so write the questions each level should have. A level with no
          questions is left out of the quiz.
        </p>
      </div>

      <div className="border-b border-border">
        <FilterTabs
          label="Difficulty level"
          value={level}
          onChange={onLevelChange}
          options={LEVELS.map((value) => ({
            value,
            label: LEVEL_LABELS[value],
            count: form.levels[value].questions.length,
          }))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={`${LEVEL_LABELS[level]} time limit (minutes)`}
          type="number"
          inputMode="numeric"
          min={LIMITS.minMinutes}
          max={LIMITS.maxMinutes}
          value={draft.duration}
          onChange={(event) =>
            dispatch({ type: "levelField", level, name: "duration", value: event.target.value })
          }
          error={levelIssue && /time limit/.test(levelIssue.message) ? levelIssue.message : undefined}
        />
        <Input
          label={`${LEVEL_LABELS[level]} points multiplier`}
          type="number"
          inputMode="decimal"
          min={LIMITS.minMultiplier}
          max={LIMITS.maxMultiplier}
          step="0.1"
          value={draft.pointsMultiplier}
          onChange={(event) =>
            dispatch({ type: "levelField", level, name: "pointsMultiplier", value: event.target.value })
          }
          hint="1 = no bonus"
          error={levelIssue && /multiplier/.test(levelIssue.message) ? levelIssue.message : undefined}
        />
      </div>
      <p className="max-w-[65ch] text-sm text-text-muted">
        The score is the percentage answered correctly times the multiplier, capped at 100. At 1.5, a
        player who gets two thirds right scores 100.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => dispatch({ type: "addQuestion", level, key: newKey() })}
          disabled={draft.questions.length >= LIMITS.maxQuestionsPerLevel}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add {LEVEL_LABELS[level].toLowerCase()} question
        </Button>
        <Button variant="secondary" onClick={() => setImporting(true)}>
          <Upload className="size-4" aria-hidden="true" />
          Import
        </Button>
        <Button variant="ghost" onClick={exportLevel} disabled={draft.questions.length === 0}>
          <Download className="size-4" aria-hidden="true" />
          Export
        </Button>
      </div>

      {draft.questions.length === 0 ? (
        <EmptyState
          title={`No ${LEVEL_LABELS[level].toLowerCase()} questions yet`}
          description="Add one above, or import a list. If you leave this level empty, players won't be offered it."
        />
      ) : (
        <ol className="space-y-4">
          {draft.questions.map((question, index) => (
            <QuestionCard
              key={question.key}
              level={level}
              question={question}
              index={index}
              total={draft.questions.length}
              problem={problems.get(index)}
              dispatch={dispatch}
            />
          ))}
        </ol>
      )}

      <ImportDialog
        open={importing}
        level={level}
        hasQuestions={draft.questions.length > 0}
        onClose={() => setImporting(false)}
        onImport={(questions, mode) => dispatch({ type: "importQuestions", level, questions, mode })}
      />
    </section>
  );
}
