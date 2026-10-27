import { checkRows, summarize, type CheckSummary, type CheckedRow } from "@/lib/quiz-format/checks";
import type { ImportIssue, ParsedImport } from "@/lib/quiz-format/types";
import { LEVELS, type EditorQuestion, type Level } from "@/lib/quiz-schema";
import {
  blankForm,
  draftQuestion,
  type DraftQuestion,
  type FormState,
} from "@/components/admin/quiz-editor/editor-state";

// The rows of an import held as an editor form, so the admin fixes a row with the same question card the
// editor uses. `meta` remembers where each row came from and what the reader said about it.

export interface RowMeta {
  /** "Row 7", "Line 12", "Easy · question 3". */
  source: string;
  note?: string;
  /** What the reader found; dropped once the row has been edited, because the edit may have fixed it. */
  readIssues: ImportIssue[];
  /** The question as read, to tell whether it has been edited since. */
  original: string;
  /** Came with no level, so it sits in the level the admin chose for those. */
  unplaced: boolean;
}

export type MetaMap = Record<string, RowMeta>;

const signature = (question: DraftQuestion): string => {
  const { key, ...rest } = question;
  void key;
  return JSON.stringify(rest);
};

export interface Staged {
  form: FormState;
  meta: MetaMap;
}

/** Puts a parsed import into a form. Questions that name no level go to `fallback`. */
export function stage(parsed: ParsedImport, fallback: Level): Staged {
  const form = blankForm();
  const meta: MetaMap = {};
  const add = (level: Level, row: ParsedImport["unplaced"][number], unplaced: boolean) => {
    const draft = draftQuestion(row.question);
    form.levels[level].questions.push(draft);
    meta[draft.key] = {
      source: row.source,
      note: row.note,
      readIssues: row.issues,
      original: signature(draft),
      unplaced,
    };
  };
  for (const level of LEVELS) {
    const entry = parsed.levels[level];
    if (!entry) continue;
    entry.rows.forEach((row) => add(level, row, false));
    if (entry.duration) form.levels[level].duration = String(entry.duration);
    if (entry.pointsMultiplier) form.levels[level].pointsMultiplier = String(entry.pointsMultiplier);
  }
  parsed.unplaced.forEach((row) => add(fallback, row, true));

  const { settings } = parsed;
  if (settings.title) form.title = settings.title;
  if (settings.description) form.description = settings.description;
  if (settings.duration) form.duration = String(settings.duration);
  if (settings.examMode) form.examMode = settings.examMode;
  if (settings.showAnswerReview !== undefined) form.showAnswerReview = settings.showAnswerReview;
  return { form, meta };
}

/** Moves the rows that came with no level from one level to another, keeping the edits made to them. */
export function moveUnplaced(form: FormState, meta: MetaMap, from: Level, to: Level): FormState {
  if (from === to) return form;
  const moving = form.levels[from].questions.filter((question) => meta[question.key]?.unplaced);
  if (moving.length === 0) return form;
  return {
    ...form,
    levels: {
      ...form.levels,
      [from]: {
        ...form.levels[from],
        questions: form.levels[from].questions.filter((question) => !meta[question.key]?.unplaced),
      },
      [to]: { ...form.levels[to], questions: [...form.levels[to].questions, ...moving] },
    },
  };
}

export const unplacedLevel = (form: FormState, meta: MetaMap): Level | null =>
  LEVELS.find((level) => form.levels[level].questions.some((question) => meta[question.key]?.unplaced)) ?? null;

export interface RowResult {
  question: DraftQuestion;
  level: Level;
  meta: RowMeta;
  checked: CheckedRow;
  skipped: boolean;
  /** Will be imported: not skipped and without errors. */
  included: boolean;
}

/**
 * Checks every row. `existing` is what the target level holds now (for the duplicate warning); leave it out
 * for a new quiz.
 */
export function checkStaged(
  form: FormState,
  meta: MetaMap,
  skipped: ReadonlySet<string>,
  existing?: Partial<Record<Level, readonly EditorQuestion[]>>
): { rows: RowResult[]; summary: CheckSummary } {
  const rows: RowResult[] = [];
  for (const level of LEVELS) {
    const drafts = form.levels[level].questions;
    if (drafts.length === 0) continue;
    const results = checkRows(
      drafts.map((question) => {
        const info: RowMeta = meta[question.key] ?? {
          source: "Added here",
          readIssues: [],
          original: "",
          unplaced: false,
        };
        const edited = signature(question) !== info.original;
        const { key, ...plain } = question;
        void key;
        return {
          question: plain,
          note: info.note,
          source: info.source,
          issues: edited ? [] : info.readIssues,
        };
      }),
      { existing: existing?.[level] }
    );
    results.forEach((checked, index) => {
      const question = drafts[index];
      const isSkipped = skipped.has(question.key);
      rows.push({
        question,
        level,
        meta: meta[question.key] ?? { source: "Added here", readIssues: [], original: "", unplaced: false },
        checked,
        skipped: isSkipped,
        included: !isSkipped && checked.status !== "error",
      });
    });
  }
  return { rows, summary: summarize(rows.filter((row) => !row.skipped).map((row) => row.checked)) };
}

/** The questions that will be imported, by level, cleaned by the schema. */
export function importable(rows: readonly RowResult[]): Partial<Record<Level, EditorQuestion[]>> {
  const byLevel: Partial<Record<Level, EditorQuestion[]>> = {};
  for (const row of rows) {
    if (!row.included || !row.checked.clean) continue;
    (byLevel[row.level] ??= []).push(row.checked.clean);
  }
  return byLevel;
}
