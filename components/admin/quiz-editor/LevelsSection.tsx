"use client";

import { Download, Eye, Plus, Upload } from "lucide-react";
import { type Dispatch, useCallback, useMemo, useState } from "react";
import { Alert, Button, EmptyState, FilterTabs, Input, SegmentedControl } from "@/components/ui";
import { downloadText, fileSlug } from "@/lib/download";
import { exportJson } from "@/lib/quiz-format/write";
import {
  LEVELS,
  LEVEL_LABELS,
  LIMITS,
  levelBytes,
  type Level,
  type ValidationIssue,
} from "@/lib/quiz-schema";
import { ChecksPanel } from "./ChecksPanel";
import { ImportDialog } from "./ImportDialog";
import { PlayerPreview } from "./PlayerPreview";
import { QuestionCard } from "./QuestionCard";
import { QuestionGrid } from "./QuestionGrid";
import { cloneAsNew } from "./grid";
import {
  draftQuestion,
  newKey,
  type DraftQuestion,
  type EditorAction,
  type FormState,
} from "./editor-state";

export type EditorView = "cards" | "grid";

interface LevelsSectionProps {
  form: FormState;
  level: Level;
  onLevelChange: (level: Level) => void;
  issues: ValidationIssue[];
  dispatch: Dispatch<EditorAction>;
  view: EditorView;
  onViewChange: (view: EditorView) => void;
  /** Bring a question into view (switching level if needed). */
  onJump: (level: Level, question?: number) => void;
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

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** What was done to the draft's questions in one go, and how to take it back. */
interface Notice {
  message: string;
  undo: Partial<Record<Level, DraftQuestion[]>>;
  /** A level to offer a "Go to" button for (where copied or moved questions went). */
  goTo?: Level;
}

/** The three difficulty levels: a tab each, with that level's time limit, multiplier and questions. */
export function LevelsSection({
  form,
  level,
  onLevelChange,
  issues,
  dispatch,
  view,
  onViewChange,
  onJump,
}: LevelsSectionProps) {
  const [importing, setImporting] = useState(false);
  const [previewAt, setPreviewAt] = useState<number | null>(null);
  // Which questions are ticked, in one level: a selection doesn't follow you to another tab.
  const [ticked, setTicked] = useState<{ level: Level; keys: ReadonlySet<string> }>({ level, keys: new Set() });
  const [notice, setNotice] = useState<Notice | null>(null);
  const draft = form.levels[level];
  const problems = problemsByQuestion(issues, level);
  const bytes = levelBytes(draft.questions);
  const levelIssue = issues.find((issue) => issue.level === level && issue.question === undefined);

  const selected = useMemo(
    () =>
      new Set(
        ticked.level === level
          ? draft.questions.filter((question) => ticked.keys.has(question.key)).map((question) => question.key)
          : []
      ),
    [draft.questions, ticked, level]
  );
  const clearSelection = () => setTicked({ level, keys: new Set() });

  const select = useCallback(
    (key: string, on: boolean) => {
      setTicked((current) => {
        const next = new Set(current.level === level ? current.keys : []);
        if (on) next.add(key);
        else next.delete(key);
        return { level, keys: next };
      });
    },
    [level]
  );
  const selectAll = useCallback(
    (on: boolean) =>
      setTicked({ level, keys: on ? new Set(draft.questions.map((question) => question.key)) : new Set() }),
    [level, draft.questions]
  );

  /** Changes whole levels' question lists and keeps what was there, so the change can be undone. */
  const change = (levels: Partial<Record<Level, DraftQuestion[]>>, message: string, goTo?: Level) => {
    const undo: Notice["undo"] = {};
    for (const key of Object.keys(levels) as Level[]) undo[key] = form.levels[key].questions;
    dispatch({ type: "setQuestions", levels });
    setNotice({ message, undo, goTo });
  };

  const chosen = draft.questions.filter((question) => selected.has(question.key));

  const copyTo = (target: Level) => {
    const room = LIMITS.maxQuestionsPerLevel - form.levels[target].questions.length;
    if (chosen.length > room) {
      setNotice({
        message: `${LEVEL_LABELS[target]} can hold ${LIMITS.maxQuestionsPerLevel} questions and has room for ${Math.max(room, 0)} more.`,
        undo: {},
      });
      return;
    }
    const copies = chosen.map((question) => cloneAsNew(question, newKey()));
    change(
      { [target]: [...form.levels[target].questions, ...copies] },
      `Copied ${plural(copies.length, "question")} to ${LEVEL_LABELS[target]}.`,
      target === level ? undefined : target
    );
    clearSelection();
  };

  const moveTo = (target: Level) => {
    const room = LIMITS.maxQuestionsPerLevel - form.levels[target].questions.length;
    if (chosen.length > room) {
      setNotice({
        message: `${LEVEL_LABELS[target]} can hold ${LIMITS.maxQuestionsPerLevel} questions and has room for ${Math.max(room, 0)} more.`,
        undo: {},
      });
      return;
    }
    // The questions are new in their new level; a stored question belongs to one level.
    const copies = chosen.map((question) => cloneAsNew(question, newKey()));
    change(
      {
        [level]: draft.questions.filter((question) => !selected.has(question.key)),
        [target]: [...form.levels[target].questions, ...copies],
      },
      `Moved ${plural(copies.length, "question")} to ${LEVEL_LABELS[target]}.`,
      target
    );
    clearSelection();
  };

  const removeChosen = () => {
    change(
      { [level]: draft.questions.filter((question) => !selected.has(question.key)) },
      `Deleted ${plural(chosen.length, "question")}.`
    );
    clearSelection();
  };

  // This level as a file in the quiz format (ids included), so it can be edited elsewhere and imported back.
  const exportLevel = () =>
    downloadText(
      `${fileSlug(form.title)}-${level}.ageno.json`,
      exportJson({
        title: form.title.trim() || "Untitled quiz",
        description: form.description,
        duration: Number(form.duration) || 30,
        examMode: form.examMode,
        showAnswerReview: form.showAnswerReview,
        levels: {
          [level]: {
            duration: Number(draft.duration) || 30,
            pointsMultiplier: Number(draft.pointsMultiplier) || 1,
            questions: draft.questions,
          },
        },
      }),
      "application/json"
    );

  return (
    <section aria-labelledby="levels-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="levels-heading" className="text-xl">
            Questions
          </h2>
          <p className="mt-1 max-w-[65ch] text-text-muted">
            Players choose a level, so write the questions each level should have. A level with no
            questions is left out of the quiz.
          </p>
        </div>
        <SegmentedControl<EditorView>
          label="Show questions as"
          value={view}
          onChange={onViewChange}
          options={[
            { value: "cards", label: "Cards" },
            { value: "grid", label: "Grid" },
          ]}
          className="w-44"
        />
      </div>

      <ChecksPanel form={form} onJump={onJump} />

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

      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
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
        <Button variant="ghost" onClick={() => setPreviewAt(0)} disabled={draft.questions.length === 0}>
          <Eye className="size-4" aria-hidden="true" />
          Preview as a player
        </Button>
      </div>

      {bytes > 0 && (
        <p
          className={
            bytes > LIMITS.maxLevelBytes
              ? "font-mono text-sm text-error"
              : bytes > LIMITS.maxLevelBytes * 0.8
                ? "font-mono text-sm text-text"
                : "font-mono text-sm text-text-muted"
          }
        >
          Text in this level: {Math.max(1, Math.round(bytes / 1000))} KB of{" "}
          {Math.round(LIMITS.maxLevelBytes / 1000)} KB
        </p>
      )}

      {notice && (
        <Alert
          variant="info"
          action={
            <div className="flex gap-2">
              {notice.goTo && (
                <Button size="sm" variant="secondary" onClick={() => onLevelChange(notice.goTo as Level)}>
                  Go to {LEVEL_LABELS[notice.goTo]}
                </Button>
              )}
              {Object.keys(notice.undo).length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    dispatch({ type: "setQuestions", levels: notice.undo });
                    setNotice(null);
                  }}
                >
                  Undo
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>
                Dismiss
              </Button>
            </div>
          }
        >
          {notice.message}
        </Alert>
      )}

      {selected.size > 0 && (
        <div
          role="toolbar"
          aria-label="Selected questions"
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-accent/60 bg-bg px-3 py-2"
        >
          <span className="mr-2 font-mono text-sm" role="status">
            {selected.size} selected
          </span>
          <span className="text-sm text-text-muted">Copy to</span>
          {LEVELS.map((target) => (
            <Button key={target} size="sm" variant="secondary" onClick={() => copyTo(target)}>
              {LEVEL_LABELS[target]}
            </Button>
          ))}
          <span className="ml-2 text-sm text-text-muted">Move to</span>
          {LEVELS.filter((target) => target !== level).map((target) => (
            <Button key={target} size="sm" variant="secondary" onClick={() => moveTo(target)}>
              {LEVEL_LABELS[target]}
            </Button>
          ))}
          <Button size="sm" variant="danger" onClick={removeChosen}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}>
            Clear selection
          </Button>
        </div>
      )}

      {draft.questions.length === 0 ? (
        <EmptyState
          title={`No ${LEVEL_LABELS[level].toLowerCase()} questions yet`}
          description="Add one above, or import a list. If you leave this level empty, players won't be offered it."
        />
      ) : view === "grid" ? (
        <QuestionGrid
          level={level}
          questions={draft.questions}
          selected={selected}
          onSelect={select}
          onSelectAll={selectAll}
          problems={problems}
          dispatch={dispatch}
          onReplace={(questions, message) => change({ [level]: questions }, message)}
          onOpenCard={(index) => {
            onViewChange("cards");
            onJump(level, index);
          }}
          onPreview={setPreviewAt}
        />
      ) : (
        <ol className="max-w-3xl space-y-4">
          {draft.questions.map((question, index) => (
            <QuestionCard
              key={question.key}
              level={level}
              question={question}
              index={index}
              total={draft.questions.length}
              problem={problems.get(index)}
              selected={selected.has(question.key)}
              onSelect={(on) => select(question.key, on)}
              onPreview={() => setPreviewAt(index)}
              dispatch={dispatch}
            />
          ))}
        </ol>
      )}

      <PlayerPreview
        questions={draft.questions}
        start={previewAt ?? 0}
        levelLabel={LEVEL_LABELS[level]}
        open={previewAt !== null}
        onClose={() => setPreviewAt(null)}
      />

      <ImportDialog
        open={importing}
        level={level}
        current={{
          easy: form.levels.easy.questions,
          medium: form.levels.medium.questions,
          hard: form.levels.hard.questions,
        }}
        onClose={() => setImporting(false)}
        onApply={(target, questions) =>
          dispatch({
            type: "importQuestions",
            level: target,
            questions: questions.map((question) => draftQuestion(question)),
            mode: "replace",
          })
        }
      />
    </section>
  );
}
