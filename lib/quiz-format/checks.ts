import { checkQuestion, type EditorQuestion } from "@/lib/quiz-schema";
import { formattingAdvice } from "@/lib/rich-text/advice";
import { error, warning, type ImportIssue, type ImportRow } from "./types";

// Holds every row of an import to the rules the editor and the server use (`checkQuestion`) and adds the
// warnings that are worth a look before saving: duplicates, a note the AI left, a "select all" question where
// everything is right, formatting that will not show as meant (a table with a missing cell). An error keeps a row out of the import until it is fixed or skipped; a warning does not.

export type RowStatus = "ok" | "warning" | "error";

export interface CheckedRow {
  row: ImportRow;
  /** The question cleaned by the schema (text trimmed, blanks dropped). Null while the row has an error. */
  clean: EditorQuestion | null;
  status: RowStatus;
  /** What the reader said, then what validation said, then the warnings. */
  issues: ImportIssue[];
}

export interface CheckOptions {
  /** Questions already in the level the rows are going to. Their text is compared for duplicates. */
  existing?: readonly EditorQuestion[];
}

/** Options longer than this get a warning; the hard limit is `LIMITS.optionText`. */
export const LONG_OPTION = 300;

export const NONE_OR_ALL = /^(all|none)\s+of\s+the\s+above\.?$/i;

/** The question text with case, spacing and punctuation taken out, so "What is 2+2?" matches "what is 2 + 2". */
export const textKey = (text: string): string =>
  text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const capitalise = (message: string) => message.charAt(0).toUpperCase() + message.slice(1);

export function checkRows(rows: readonly ImportRow[], options: CheckOptions = {}): CheckedRow[] {
  const existing = new Map<string, EditorQuestion>();
  const importedIds = new Set(rows.map((row) => row.question.id).filter((id): id is string => !!id));
  for (const question of options.existing ?? []) {
    // A question the file updates in place isn't a duplicate of itself.
    if (question.id && importedIds.has(question.id)) continue;
    const key = textKey(question.text);
    if (key && !existing.has(key)) existing.set(key, question);
  }

  const seen = new Map<string, string>();
  return rows.map((row) => {
    const issues: ImportIssue[] = [...row.issues];
    const { question, problems } = checkQuestion(row.question);
    for (const problem of problems) issues.push(error(problem));

    const key = textKey(row.question.text);
    if (key) {
      const first = seen.get(key);
      if (first !== undefined) issues.push(warning(`the same question as ${first}.`));
      else seen.set(key, row.source.toLowerCase());
      if (existing.has(key)) issues.push(warning("this question is already in the level."));
    }

    const optionList = row.question.options;
    if (optionList.length > 1 && optionList.every((option) => option.isCorrect)) {
      issues.push(warning("every option is marked correct."));
    }
    optionList.forEach((option, index) => {
      if (option.text.length > LONG_OPTION) {
        issues.push(warning(`option ${index + 1} is very long (${option.text.length} characters).`));
      }
      if (NONE_OR_ALL.test(option.text.trim())) {
        issues.push(warning(`option ${index + 1} is "${option.text.trim()}", which stops making sense if the options are reordered.`));
      }
    });
    // A broken table, HTML shown as text, a table too wide for a phone: a warning, never a reason to refuse the row.
    for (const advice of formattingAdvice(row.question)) issues.push(warning(advice.message));
    if (row.note) issues.push(warning(`note: ${row.note}`));

    const status: RowStatus = issues.some((issue) => issue.severity === "error")
      ? "error"
      : issues.length > 0
        ? "warning"
        : "ok";
    return { row, clean: status === "error" ? null : question, status, issues };
  });
}

export interface CheckSummary {
  total: number;
  /** No errors; warnings still count as ready. */
  ready: number;
  withWarnings: number;
  withErrors: number;
  /** The sources of the rows with errors, in order. */
  failing: string[];
  /** "46 questions: 44 ready, 2 need fixing (Row 7, Row 31)". */
  text: string;
}

export function summarize(checked: readonly CheckedRow[]): CheckSummary {
  const failing = checked.filter((item) => item.status === "error").map((item) => item.row.source);
  const withWarnings = checked.filter((item) => item.status === "warning").length;
  const total = checked.length;
  const ready = total - failing.length;
  const noun = (n: number) => `${n} question${n === 1 ? "" : "s"}`;
  if (total === 0) return { total, ready, withWarnings, withErrors: 0, failing, text: "No questions found." };

  let text = `${noun(total)}: `;
  if (failing.length === 0) {
    text += withWarnings > 0 ? `all ready, ${withWarnings} with a warning` : "all ready";
  } else {
    const shown = failing.slice(0, 5).join(", ");
    const more = failing.length > 5 ? ` and ${failing.length - 5} more` : "";
    text += `${ready} ready, ${failing.length} need${failing.length === 1 ? "s" : ""} fixing (${shown}${more})`;
  }
  return { total, ready, withWarnings, withErrors: failing.length, failing, text };
}

/** "Row 7: write the question." */
export const issueText = (source: string, issue: ImportIssue): string => `${source}: ${issue.message}`;

/** For a list: the message with its first letter in capitals. */
export const issueMessage = (issue: ImportIssue): string => capitalise(issue.message);
