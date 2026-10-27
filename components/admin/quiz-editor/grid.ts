import { detectColumns, fieldOf, parseCorrect, OPTION_LETTERS } from "@/lib/quiz-import/spreadsheet";
import { parseTable } from "@/lib/quiz-import/table";
import { LIMITS, blankQuestion } from "@/lib/quiz-schema";
import type { DraftQuestion } from "./editor-state";

const MAX_OPTIONS = LIMITS.maxOptions;

// The pure half of the grid view: which columns a level needs, what typing in a cell does to a question, and
// what pasting a block of cells from a spreadsheet does to a list of questions. Columns are numbered as the
// grid shows them: 0 is the question, 1 to N the options A, B, C ..., and N + 1 the correct answer
// (`B`, `A,C`, or an option's text, read the way the importer reads it).

export const MIN_OPTION_COLUMNS = 4;

/** How many option columns a level's grid shows to start with: its widest question, and at least four. */
export const optionColumnsFor = (questions: readonly DraftQuestion[]): number =>
  Math.min(MAX_OPTIONS, Math.max(MIN_OPTION_COLUMNS, ...questions.map((question) => question.options.length)));

const blankOption = () => ({ text: "", isCorrect: false });

/** Sets the question text (column 0) or an option's text (column n, option n - 1), adding options if needed. */
export function setCell(question: DraftQuestion, column: number, value: string): DraftQuestion {
  if (column <= 0) return { ...question, text: value };
  const index = column - 1;
  if (index >= MAX_OPTIONS) return question;
  const options = question.options.map((option) => ({ ...option }));
  while (options.length <= index) options.push(blankOption());
  options[index].text = value;
  return { ...question, options };
}

/** The letters of the right options, as the correct column shows them: "B", "A, C". */
export const correctLetters = (question: DraftQuestion): string =>
  question.options.flatMap((option, i) => (option.isCorrect ? [String.fromCharCode(65 + i)] : [])).join(", ");

/**
 * Sets which options are right from what was typed in the correct column. A blank cell leaves things as
 * they are. Returns the problem when the text can't be read, and the question unchanged.
 */
export function setCorrectFromText(
  question: DraftQuestion,
  cell: string
): { question: DraftQuestion; problem?: string } {
  if (!cell.trim()) return { question };
  const read = parseCorrect(
    cell,
    question.options.map((option) => option.text)
  );
  const failed = read.issues.find((issue) => issue.severity === "error");
  if (failed || read.indexes.length === 0) {
    return { question, problem: failed?.message ?? "the correct answer isn't a letter or an option." };
  }
  const right = new Set(read.indexes);
  return {
    question: {
      ...question,
      // Several right options can only be a select-all question.
      type: right.size > 1 ? "multiple" : question.type,
      options: question.options.map((option, i) => ({ ...option, isCorrect: right.has(i) })),
    },
  };
}

/** A copy that is a new question: its own key, no id (the server hands out a new one), its own options. */
export const cloneAsNew = (question: DraftQuestion, key: string): DraftQuestion => {
  const { id, ...rest } = question;
  void id;
  return { ...rest, key, options: rest.options.map((option) => ({ ...option })) };
};

export interface GridPaste {
  questions: DraftQuestion[];
  /** How many option columns the grid needs now (a pasted sheet may have more than it showed). */
  optionColumns: number;
  /** Cells that were applied. */
  applied: number;
  /** Cells that were not: past the last column, or a correct answer that couldn't be read. */
  ignored: number;
  /** Rows added at the end of the list. */
  added: number;
  /** The block began with a header row; the columns were matched by name and the header left out. */
  usedHeader: boolean;
}

/** Does this text hold more than one cell? A single value is left to the browser's own paste. */
export const isBlockOfCells = (text: string): boolean => /[\t\r\n]/.test(text.replace(/[\r\n]+$/, ""));

/** Lays one record out as the grid has it (question, options, correct), using the header's own column names. */
function layOut(records: string[][], optionColumns: number): { rows: string[][]; optionColumns: number } {
  const map = detectColumns(records[0]).fields;
  const letters = OPTION_LETTERS.filter((letter) => map[`option_${letter}`] !== undefined);
  const width = Math.min(MAX_OPTIONS, Math.max(optionColumns, letters.length ? OPTION_LETTERS.indexOf(letters[letters.length - 1]) + 1 : 0));
  const rows = records.slice(1).map((record) => {
    const cell = (index: number | undefined) => (index === undefined ? "" : (record[index] ?? ""));
    return [
      cell(map.question),
      ...OPTION_LETTERS.slice(0, width).map((letter) => cell(map[`option_${letter}`])),
      cell(map.correct),
    ];
  });
  return { rows, optionColumns: width };
}

/**
 * Pastes `text` (tab-separated cells, as copied from a spreadsheet) with its top-left cell at (row, column).
 * A block that starts with a header row (Question, A, B, C, D, Correct ...) is matched by those names instead,
 * wherever its columns sit, and always starts at the first column.
 */
export function pasteIntoGrid(
  questions: readonly DraftQuestion[],
  optionColumns: number,
  start: { row: number; column: number },
  text: string,
  makeKey: () => string
): GridPaste {
  const records = parseTable(text, "\t").records;
  // Spreadsheets end a copied block with a line break; a row of empty cells is not data.
  while (records.length > 0 && records[records.length - 1].every((cell) => !cell.trim())) records.pop();

  // A header names a Question column and mostly consists of names the importer knows. A first row of data that
  // happens to hold "q" and "B" among other cells isn't one.
  const named = records.length > 1 ? records[0].filter((cell) => cell.trim()).map((cell) => fieldOf(cell.trim())) : [];
  const recognised = named.filter((field) => field !== null).length;
  const usedHeader = named.includes("question") && recognised >= 2 && recognised * 2 > named.length;
  let rows: string[][] = records;
  let column0 = start.column;
  let columns = optionColumns;
  if (usedHeader) {
    const laidOut = layOut(records, optionColumns);
    rows = laidOut.rows;
    columns = laidOut.optionColumns;
    column0 = 0;
  }
  const correctColumn = columns + 1;

  const list = [...questions];
  let applied = 0;
  let ignored = 0;
  let added = 0;
  let widest = columns;

  rows.forEach((cells, offset) => {
    const row = start.row + offset;
    let question = list[row];
    if (!question) {
      question = { ...blankQuestion(), key: makeKey() };
      added++;
    }

    let correct = "";
    cells.forEach((raw, i) => {
      const column = column0 + i;
      const cell = raw.replace(/\s+$/, "");
      if (column > correctColumn) {
        if (cell.trim()) ignored++;
        return;
      }
      if (column === correctColumn) {
        correct = cell;
        return;
      }
      // Don't grow a question for an empty cell past its last option.
      if (column > question.options.length && !cell) return;
      question = setCell(question, column, cell);
      widest = Math.max(widest, question.options.length);
      applied++;
    });

    if (correct.trim()) {
      const result = setCorrectFromText(question, correct);
      if (result.problem) ignored++;
      else applied++;
      question = result.question;
    }
    list[row] = question;
  });

  return { questions: list, optionColumns: Math.min(MAX_OPTIONS, widest), applied, ignored, added, usedHeader };
}
