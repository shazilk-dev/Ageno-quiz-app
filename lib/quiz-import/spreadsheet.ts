import { LEVELS, LIMITS, isLevel, type EditorOption, type Level } from "@/lib/quiz-schema";
import type { QuestionType } from "@/lib/exam/normalize";
import {
  MAX_IMPORT_BYTES,
  addRow,
  emptyImport,
  error,
  warning,
  type ImportIssue,
  type ImportRow,
  type ParsedImport,
} from "@/lib/quiz-format/types";
import { parseTable, unescapeCell } from "./table";

// Spreadsheet rows (pasted from Excel or Sheets, or a CSV file) as questions. One row is one question:
//
//   id | level | type | question | option_a ... option_j | correct | explanation | a_why ... j_why | image | note
//
// Columns are found by their header, not their position, so they can come in any order and extra columns
// are ignored. A row whose first cell starts with `#` is a comment (the template's instruction row and its
// sample row), and blank rows are skipped.

export const OPTION_LETTERS = "abcdefghij".slice(0, LIMITS.maxOptions).split("");

export type SheetField =
  | "id"
  | "level"
  | "type"
  | "question"
  | "correct"
  | "explanation"
  | "image"
  | "note"
  | `option_${string}`
  | `why_${string}`;

const optionField = (letter: string): SheetField => `option_${letter}`;
const whyField = (letter: string): SheetField => `why_${letter}`;

/** How a header is spelled once case, spaces and punctuation are taken out ("Option A", "option_a" -> "optiona"). */
const squash = (header: string): string => header.toLowerCase().replace(/[^a-z0-9]+/g, "");

const SYNONYMS: Record<string, SheetField> = {
  id: "id",
  questionid: "id",
  level: "level",
  difficulty: "level",
  type: "type",
  questiontype: "type",
  question: "question",
  questiontext: "question",
  text: "question",
  q: "question",
  correct: "correct",
  correctanswer: "correct",
  correctanswers: "correct",
  answer: "correct",
  answers: "correct",
  key: "correct",
  explanation: "explanation",
  why: "explanation",
  image: "image",
  imageurl: "image",
  img: "image",
  picture: "image",
  note: "note",
  notes: "note",
};
for (const letter of OPTION_LETTERS) {
  for (const word of ["option", "choice", "answer", ""]) SYNONYMS[`${word}${letter}`] = optionField(letter);
  for (const form of [
    `${letter}why`,
    `why${letter}`,
    `${letter}reason`,
    `reason${letter}`,
    `${letter}rationale`,
    `rationale${letter}`,
    `option${letter}why`,
    `option${letter}reason`,
    `option${letter}rationale`,
  ]) {
    SYNONYMS[form] = whyField(letter);
  }
}

export const fieldOf = (header: string): SheetField | null => SYNONYMS[squash(header)] ?? null;

export interface ColumnMap {
  /** Column index for each field found. */
  fields: Partial<Record<SheetField, number>>;
  /** Headers that matched nothing (their columns are ignored). */
  ignored: string[];
  /** Fields that two columns claimed; the first one is used. */
  duplicated: SheetField[];
}

/** Finds what each column is. The wizard shows this and lets the admin fix it only when something is missing. */
export function detectColumns(headers: readonly string[]): ColumnMap {
  const fields: ColumnMap["fields"] = {};
  const ignored: string[] = [];
  const duplicated: SheetField[] = [];
  headers.forEach((header, index) => {
    if (!header.trim()) return;
    const field = fieldOf(header);
    if (!field) {
      ignored.push(header.trim());
    } else if (fields[field] !== undefined) {
      if (!duplicated.includes(field)) duplicated.push(field);
    } else {
      fields[field] = index;
    }
  });
  return { fields, ignored, duplicated };
}

/** The required columns that have no match: the question, two options and the correct answer. */
export function missingColumns(fields: ColumnMap["fields"]): string[] {
  const missing: string[] = [];
  if (fields.question === undefined) missing.push("question");
  if (fields.option_a === undefined || fields.option_b === undefined) missing.push("at least two option columns (option_a, option_b)");
  if (fields.correct === undefined) missing.push("correct");
  return missing;
}

const cellAt = (record: readonly string[], map: ColumnMap["fields"], field: SheetField): string => {
  const index = map[field];
  return index === undefined ? "" : unescapeCell((record[index] ?? "").trim());
};

const isBlank = (record: readonly string[]) => record.every((cell) => !cell.trim());
const isComment = (record: readonly string[]) => record.find((cell) => cell.trim())?.trim().startsWith("#") ?? false;

const letterIndex = (token: string): number => {
  const lower = token.toLowerCase();
  return /^[a-z]$/.test(lower) ? lower.charCodeAt(0) - 97 : -1;
};

/**
 * Reads the `correct` cell. Accepts a letter (`B`), a position (`2`), the option's exact text, and for a
 * select-all question a list of those (`A,C`, `1;3`, `A and C`). The exact text of an option wins over a
 * letter or number, because options such as "4" or "B" exist.
 */
export function parseCorrect(cell: string, options: readonly string[]): { indexes: number[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const text = cell.trim();
  if (!text) return { indexes: [], issues: [error("the correct answer is empty.")] };

  const whole = options.findIndex((option) => option.trim().toLowerCase() === text.toLowerCase());
  const reference = (token: string): number => {
    const letter = letterIndex(token);
    if (letter >= 0) return letter;
    if (/^\d+$/.test(token)) return Number(token) - 1;
    return -1;
  };
  if (whole >= 0) {
    const meant = reference(text);
    if (meant >= 0 && meant !== whole && meant < options.length) {
      issues.push(warning(`"${text}" is the text of option ${whole + 1} and also names option ${meant + 1}; used the text.`));
    }
    return { indexes: [whole], issues };
  }

  const indexes = new Set<number>();
  const unknown: string[] = [];
  for (const token of text.split(/\s*(?:[,;|/&+]|\band\b)\s*|\s+/i).filter(Boolean)) {
    const index = reference(token);
    if (index >= 0 && index < options.length) {
      indexes.add(index);
      continue;
    }
    const byText = options.findIndex((option) => option.trim().toLowerCase() === token.toLowerCase());
    if (byText >= 0) indexes.add(byText);
    else if (index >= options.length) {
      issues.push(error(`the correct answer names option ${token.toUpperCase()}, but there are only ${options.length} options.`));
    } else {
      unknown.push(token);
    }
  }
  if (unknown.length > 0) {
    // When nothing matched, the whole cell was probably meant as the text of an option that isn't there.
    const shown = indexes.size === 0 && issues.length === 0 ? text : unknown.join(", ");
    issues.push(error(`the correct answer "${shown}" isn't a letter, a number or the text of an option.`));
  }
  return { indexes: [...indexes].sort((a, b) => a - b), issues };
}

const TYPE_WORDS: Record<string, QuestionType> = {
  single: "single",
  s: "single",
  one: "single",
  singlechoice: "single",
  multiple: "multiple",
  m: "multiple",
  multi: "multiple",
  many: "multiple",
  selectall: "multiple",
  multiplechoice: "multiple",
  multipleanswers: "multiple",
};

function questionFromRecord(record: readonly string[], map: ColumnMap["fields"], source: string): ImportRow {
  const cell = (field: SheetField) => cellAt(record, map, field);
  const row: ImportRow = { question: { type: "single", text: cell("question"), options: [] }, source, issues: [] };
  const { question, issues } = row;

  const id = cell("id");
  if (id) question.id = id;

  // Options run from option_a to the last one that has text; a gap in the middle stays and is reported.
  const optionTexts: string[] = [];
  const reasons: string[] = [];
  let last = -1;
  OPTION_LETTERS.forEach((letter, index) => {
    optionTexts[index] = cell(optionField(letter));
    reasons[index] = cell(whyField(letter));
    if (optionTexts[index] || reasons[index]) last = index;
  });
  const count = last + 1;
  const flags: EditorOption[] = [];
  for (let i = 0; i < count; i++) {
    const option: EditorOption = { text: optionTexts[i], isCorrect: false };
    if (reasons[i]) option.rationale = reasons[i];
    flags.push(option);
  }

  const picked = parseCorrect(cell("correct"), optionTexts.slice(0, count));
  issues.push(...picked.issues);
  for (const index of picked.indexes) flags[index].isCorrect = true;
  question.options = flags;

  const typed = cell("type");
  const inferred: QuestionType = picked.indexes.length > 1 ? "multiple" : "single";
  if (!typed) {
    question.type = inferred;
  } else {
    const word = TYPE_WORDS[typed.toLowerCase().replace(/[^a-z]+/g, "")];
    if (word) question.type = word;
    else {
      issues.push(error(`the type "${typed}" isn't single or multiple.`));
      question.type = inferred;
    }
  }

  const explanation = cell("explanation");
  if (explanation) question.explanation = explanation;
  const image = cell("image");
  if (image) question.imageUrl = image;
  const note = cell("note");
  if (note) row.note = note;
  return row;
}

/**
 * Reads records (from `parseTable`) into questions. `columns` overrides the header detection, which is
 * what the wizard's column step passes once the admin has fixed a mapping.
 */
export function readSpreadsheet(records: readonly (readonly string[])[], columns?: ColumnMap["fields"]): ParsedImport {
  const parsed = emptyImport("questions");
  const lines = records.map((record, index) => ({ record, number: index + 1 }));
  const content = lines.filter(({ record }) => !isBlank(record) && !isComment(record));
  if (content.length === 0) {
    parsed.issues.push(error("There is nothing to import. Include the header row and at least one question."));
    return parsed;
  }

  const [header, ...body] = content;
  const detected = detectColumns(header.record);
  const fields = columns ?? detected.fields;
  const missing = missingColumns(fields);
  if (missing.length > 0) {
    parsed.issues.push(
      error(`I couldn't find ${missing.join(", ")} in the first row. The first row must have the column names (question, option_a, option_b, correct, ...).`)
    );
    return parsed;
  }
  if (detected.ignored.length > 0 && !columns) {
    parsed.issues.push(warning(`These columns aren't used: ${detected.ignored.join(", ")}.`));
  }
  if (detected.duplicated.length > 0 && !columns) {
    parsed.issues.push(warning(`More than one column is named ${detected.duplicated.join(", ")}; the first of each is used.`));
  }

  if (body.length === 0) parsed.issues.push(error("There is a header row but no questions under it."));
  for (const { record, number } of body) {
    const source = `Row ${number}`;
    const row = questionFromRecord(record, fields, source);
    const levelCell = cellAt(record, fields, "level");
    let level: Level | null = null;
    if (levelCell) {
      const named = levelCell.toLowerCase();
      if (isLevel(named)) level = named;
      else row.issues.push(error(`the level "${levelCell}" isn't one of ${LEVELS.join(", ")}.`));
    }
    addRow(parsed, level, row);
  }
  return parsed;
}

/** Pasted cells or CSV text as an import. The separator is found from the first line. */
export function parseSpreadsheetText(text: string): ParsedImport {
  if (!text.trim()) {
    const parsed = emptyImport("questions");
    parsed.issues.push(error("There is nothing to import."));
    return parsed;
  }
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    const parsed = emptyImport("questions");
    parsed.issues.push(error(`That is more than ${MAX_IMPORT_BYTES / 1_000_000} MB. Split the questions into several files.`));
    return parsed;
  }
  const table = parseTable(text);
  const parsed = readSpreadsheet(table.records);
  if (table.unterminated !== null) {
    parsed.issues.unshift(error(`A quoted cell starting at row ${table.unterminated} never closes. Check for a stray " in that row.`));
  }
  return parsed;
}
