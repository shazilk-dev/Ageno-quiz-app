import type { EditorQuestion, ExamMode, Level } from "@/lib/quiz-schema";
import { convertBreakTags } from "./breaks";

// What every way of bringing a quiz in (the JSON file, pasted spreadsheet cells, CSV, the plain-text format)
// hands to the import wizard. A reader never throws on bad content and never refuses a whole file for one
// bad question: it returns what it could read and says what is wrong where, so the admin sees the problems
// row by row and fixes or skips them.

/** The `format` marker and `version` of "Ageno Quiz Format". The version is separate from the stored `schemaVersion`. */
export const FORMAT_NAME = "ageno-quiz";
export const FORMAT_VERSION = 1;

/** Largest file or paste the readers look at (UTF-8 bytes). A full quiz of 3 x 400 questions is far below it. */
export const MAX_IMPORT_BYTES = 5_000_000;

export type IssueSeverity = "error" | "warning";

export interface ImportIssue {
  severity: IssueSeverity;
  /** A short sentence. Written so it can follow a place: "Row 7: the correct answer names option F ...". */
  message: string;
}

export const error = (message: string): ImportIssue => ({ severity: "error", message });
export const warning = (message: string): ImportIssue => ({ severity: "warning", message });

/** One question as read: best effort, it may well fail validation. The checks decide that. */
export interface ImportRow {
  question: EditorQuestion;
  /** The AI's remark about this question ("I guessed the answer"). Shown in the preview, never stored. */
  note?: string;
  /** Where it came from, for messages: "Row 7", "Line 12", "Easy · question 3". */
  source: string;
  /** Problems found while reading, before validation. */
  issues: ImportIssue[];
}

export interface ImportLevel {
  /** Minutes, when the source says. */
  duration?: number;
  pointsMultiplier?: number;
  rows: ImportRow[];
}

/** The quiz-wide settings a file may carry. Everything is optional; the wizard fills in the rest. */
export interface ImportSettings {
  title?: string;
  description?: string;
  /** Default minutes. */
  duration?: number;
  examMode?: ExamMode;
  showAnswerReview?: boolean;
}

export interface ParsedImport {
  /** A whole quiz, one level, or a bare list of questions. */
  shape: "quiz" | "level" | "questions";
  settings: ImportSettings;
  levels: Partial<Record<Level, ImportLevel>>;
  /** Questions that name no level; the wizard asks where they go. */
  unplaced: ImportRow[];
  /** Problems with the file as a whole (not JSON, newer version, unknown fields, ...). */
  issues: ImportIssue[];
}

export const emptyImport = (shape: ParsedImport["shape"] = "questions"): ParsedImport => ({
  shape,
  settings: {},
  levels: {},
  unplaced: [],
  issues: [],
});

/**
 * The last step of every reader: `<br>` (what an AI writes for a line break) becomes a real line break in
 * every row, with a warning on that row.
 */
export function finishRows(parsed: ParsedImport): ParsedImport {
  for (const row of allRows(parsed)) {
    if (convertBreakTags(row.question)) {
      row.issues.push(warning("<br> was turned into a line break (into a space inside a table row). Check how it reads."));
    }
  }
  return parsed;
}

/** Every row, in the order players would see them. */
export function allRows(parsed: ParsedImport): ImportRow[] {
  const rows: ImportRow[] = [];
  for (const level of ["easy", "medium", "hard"] as const) rows.push(...(parsed.levels[level]?.rows ?? []));
  return [...rows, ...parsed.unplaced];
}

export const hasFileErrors = (parsed: ParsedImport): boolean =>
  parsed.issues.some((issue) => issue.severity === "error");

/** Adds a row to a level, making the level when it is the first. */
export function addRow(parsed: ParsedImport, level: Level | null, row: ImportRow): void {
  if (!level) {
    parsed.unplaced.push(row);
    return;
  }
  (parsed.levels[level] ??= { rows: [] }).rows.push(row);
}
