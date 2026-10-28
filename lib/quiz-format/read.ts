import {
  EXAM_MODES,
  LEVELS,
  LEVEL_LABELS,
  LIMITS,
  isLevel,
  type EditorOption,
  type Level,
} from "@/lib/quiz-schema";
import { QUESTION_TYPES, type QuestionType } from "@/lib/exam/normalize";
import {
  FORMAT_NAME,
  FORMAT_VERSION,
  MAX_IMPORT_BYTES,
  addRow,
  emptyImport,
  error,
  finishRows,
  warning,
  type ImportIssue,
  type ImportLevel,
  type ImportRow,
  type ParsedImport,
} from "./types";

// Reads "Ageno Quiz Format" (JSON): a whole quiz in an envelope, one level, or a bare list of questions.
// Reading is forgiving on purpose, because the file usually comes from an AI: a wrong question is reported
// on its own row and the rest still load. `checkRows` (checks.ts) then holds every row to the same rules
// the editor and the server use.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const blank = (value: unknown): boolean => value === undefined || value === null || value === "";

const QUIZ_KEYS = ["format", "version", "quiz", "levels"];
const SETTINGS_KEYS = ["title", "description", "duration", "examMode", "showAnswerReview"];
const LEVEL_KEYS = ["questions", "duration", "pointsMultiplier"];
const QUESTION_KEYS = ["id", "type", "text", "options", "explanation", "imageUrl", "note", "correctIndex"];
// Fields an older export or a database copy carries; they mean nothing here, so they are not worth a warning.
const QUIET_QUESTION_KEYS = ["points", "order", "schemaVersion", "difficulty"];
const OPTION_KEYS = ["text", "isCorrect", "rationale"];

const quote = (keys: string[]) => keys.map((key) => `"${key}"`).join(", ");

function unknownKeys(raw: Record<string, unknown>, known: string[], where: string, quiet: string[] = []): ImportIssue[] {
  const extra = Object.keys(raw).filter((key) => !known.includes(key) && !quiet.includes(key));
  if (extra.length === 0) return [];
  const one = extra.length === 1;
  const text = `${quote(extra)} ${one ? "is" : "are"} not part of the format and ${one ? "was" : "were"} ignored.`;
  return [warning(where ? `${where}: ${text}` : text)];
}

/** Turns a JSON syntax error into "line 5, column 3" when the engine reports a position. */
function describeJsonError(text: string, cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  const at = /position (\d+)/.exec(message);
  if (at) {
    const position = Math.min(Number(at[1]), text.length);
    const before = text.slice(0, position).split("\n");
    return `That isn't valid JSON (near line ${before.length}, column ${before[before.length - 1].length + 1}).`;
  }
  return "That isn't valid JSON.";
}

/** The text of a JSON file or paste: BOM and size checked, then parsed. */
export function parseQuizJson(text: string): ParsedImport {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!source.trim()) {
    const parsed = emptyImport();
    parsed.issues.push(error("The file is empty."));
    return parsed;
  }
  if (new TextEncoder().encode(source).length > MAX_IMPORT_BYTES) {
    const parsed = emptyImport();
    parsed.issues.push(error(`That is more than ${MAX_IMPORT_BYTES / 1_000_000} MB. Split the quiz into several files.`));
    return parsed;
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    const parsed = emptyImport();
    parsed.issues.push(error(describeJsonError(source, cause)));
    return parsed;
  }
  return readQuizValue(value);
}

/** The question a file would create, as far as it can be read. Never throws. */
export function readQuestion(raw: unknown, source: string): ImportRow {
  const row: ImportRow = {
    question: { type: "single", text: "", options: [] },
    source,
    issues: [],
  };
  if (!isRecord(raw)) {
    row.issues.push(error("this is not a question (expected an object with text and options)."));
    return row;
  }
  const { question, issues } = row;
  issues.push(...unknownKeys(raw, QUESTION_KEYS, "", QUIET_QUESTION_KEYS));

  if (!blank(raw.id)) {
    if (typeof raw.id === "string") question.id = raw.id;
    else issues.push(error('"id" must be text.'));
  }

  if (typeof raw.text === "string") question.text = raw.text;
  else if (!blank(raw.text)) issues.push(error('"text" must be text.'));

  const legacyIndex =
    typeof raw.correctIndex === "number" && Number.isInteger(raw.correctIndex) ? raw.correctIndex : null;
  let flagged = false;
  if (Array.isArray(raw.options)) {
    raw.options.forEach((item, index) => {
      const number = index + 1;
      const option: EditorOption = { text: "", isCorrect: false };
      if (typeof item === "string") {
        option.text = item;
      } else if (isRecord(item)) {
        issues.push(...unknownKeys(item, OPTION_KEYS, `option ${number}`));
        if (typeof item.text === "string") option.text = item.text;
        else if (!blank(item.text)) issues.push(error(`option ${number}: "text" must be text.`));
        if (typeof item.isCorrect === "boolean") option.isCorrect = item.isCorrect;
        else if (item.isCorrect !== undefined) issues.push(error(`option ${number}: "isCorrect" must be true or false.`));
        if (typeof item.rationale === "string") option.rationale = item.rationale;
        else if (!blank(item.rationale)) issues.push(error(`option ${number}: "rationale" must be text.`));
      } else {
        issues.push(error(`option ${number} is not valid (expected text or { "text", "isCorrect" }).`));
      }
      if (option.isCorrect) flagged = true;
      question.options.push(option);
    });
    // The older export wrote plain-text options and one `correctIndex`.
    if (!flagged && legacyIndex !== null && question.options[legacyIndex]) {
      question.options[legacyIndex].isCorrect = true;
    }
  } else if (raw.options !== undefined) {
    issues.push(error('"options" must be a list.'));
  }

  const correct = question.options.filter((option) => option.isCorrect).length;
  const inferred: QuestionType = correct > 1 ? "multiple" : "single";
  if (blank(raw.type)) {
    question.type = inferred;
  } else if ((QUESTION_TYPES as readonly unknown[]).includes(raw.type)) {
    question.type = raw.type as QuestionType;
  } else {
    issues.push(error('"type" must be "single" or "multiple".'));
    question.type = inferred;
  }

  for (const key of ["explanation", "imageUrl", "note"] as const) {
    const value = raw[key];
    if (typeof value === "string") {
      if (key === "note") row.note = value.trim() || undefined;
      else question[key] = value;
    } else if (!blank(value)) {
      issues.push(error(`"${key}" must be text.`));
    }
  }
  return row;
}

function readSettings(raw: unknown, parsed: ParsedImport): void {
  if (raw === undefined || raw === null) return;
  if (!isRecord(raw)) {
    parsed.issues.push(error('"quiz" must be an object with a title and the quiz settings.'));
    return;
  }
  parsed.issues.push(...unknownKeys(raw, SETTINGS_KEYS, '"quiz"'));
  const { settings } = parsed;
  if (typeof raw.title === "string") settings.title = raw.title.trim();
  else if (!blank(raw.title)) parsed.issues.push(error('"quiz.title" must be text.'));
  if (typeof raw.description === "string") settings.description = raw.description.trim();
  else if (!blank(raw.description)) parsed.issues.push(error('"quiz.description" must be text.'));
  if (!blank(raw.duration)) {
    if (isMinutes(raw.duration)) settings.duration = raw.duration;
    else parsed.issues.push(error(`"quiz.duration" must be a whole number of minutes from ${LIMITS.minMinutes} to ${LIMITS.maxMinutes}.`));
  }
  if (!blank(raw.examMode)) {
    if ((EXAM_MODES as readonly unknown[]).includes(raw.examMode)) settings.examMode = raw.examMode as (typeof EXAM_MODES)[number];
    else parsed.issues.push(error('"quiz.examMode" must be "practice" or "strict".'));
  }
  if (typeof raw.showAnswerReview === "boolean") settings.showAnswerReview = raw.showAnswerReview;
  else if (!blank(raw.showAnswerReview)) parsed.issues.push(error('"quiz.showAnswerReview" must be true or false.'));
}

const isMinutes = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= LIMITS.minMinutes && value <= LIMITS.maxMinutes;

const isMultiplier = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= LIMITS.minMultiplier && value <= LIMITS.maxMultiplier;

/** Reads a level's own settings and its questions into `target` (a level, or the unplaced list when null). */
function readLevel(raw: Record<string, unknown>, level: Level | null, parsed: ParsedImport): void {
  const label = level ? LEVEL_LABELS[level] : "This level";
  parsed.issues.push(...unknownKeys(raw, [...LEVEL_KEYS, "level"], label));
  const settings: ImportLevel = { rows: [] };
  if (!blank(raw.duration)) {
    if (isMinutes(raw.duration)) settings.duration = raw.duration;
    else parsed.issues.push(error(`${label}: "duration" must be a whole number of minutes from ${LIMITS.minMinutes} to ${LIMITS.maxMinutes}.`));
  }
  if (!blank(raw.pointsMultiplier)) {
    if (isMultiplier(raw.pointsMultiplier)) settings.pointsMultiplier = raw.pointsMultiplier;
    else parsed.issues.push(error(`${label}: "pointsMultiplier" must be a number from ${LIMITS.minMultiplier} to ${LIMITS.maxMultiplier}.`));
  }
  if (!Array.isArray(raw.questions)) {
    parsed.issues.push(error(`${label}: "questions" must be a list.`));
    return;
  }
  raw.questions.forEach((item, index) => {
    const source = level ? `${label} · question ${index + 1}` : `Question ${index + 1}`;
    addRow(parsed, level, readQuestion(item, source));
  });
  if (level) {
    const existing = parsed.levels[level];
    parsed.levels[level] = { ...settings, rows: existing?.rows ?? settings.rows };
  } else if (settings.duration || settings.pointsMultiplier) {
    // Settings for a level the file does not name: nothing to attach them to.
    parsed.issues.push(warning("The level's time and multiplier were ignored because the level isn't named."));
  }
}

/** A parsed JSON value (from `JSON.parse`, or built in code) as an import. */
export const readQuizValue = (value: unknown): ParsedImport => finishRows(readValue(value));

function readValue(value: unknown): ParsedImport {
  if (Array.isArray(value)) {
    const parsed = emptyImport("questions");
    value.forEach((item, index) => parsed.unplaced.push(readQuestion(item, `Question ${index + 1}`)));
    if (value.length === 0) parsed.issues.push(error("The list has no questions in it."));
    return parsed;
  }
  if (!isRecord(value)) {
    const parsed = emptyImport();
    parsed.issues.push(error("Expected a quiz, a level or a list of questions."));
    return parsed;
  }

  // One level on its own: { "level"?: "easy", "questions": [...] }
  if (value.levels === undefined && Array.isArray(value.questions)) {
    const parsed = emptyImport("level");
    let level: Level | null = null;
    if (!blank(value.level)) {
      if (isLevel(value.level)) level = value.level;
      else parsed.issues.push(error(`"level" must be one of ${LEVELS.join(", ")}.`));
    }
    readLevel(value, level, parsed);
    if (value.questions.length === 0) parsed.issues.push(error("The list has no questions in it."));
    return parsed;
  }

  const parsed = emptyImport("quiz");
  if (!isRecord(value.levels)) {
    parsed.issues.push(error('Add "levels" with the questions, for example { "easy": { "questions": [...] } }.'));
  }

  if (value.format !== undefined && value.format !== FORMAT_NAME) {
    parsed.issues.push(error(`"format" must be "${FORMAT_NAME}".`));
  }
  if (value.version === undefined) {
    parsed.issues.push(warning(`No "version" in the file; read as version ${FORMAT_VERSION}.`));
  } else if (typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1) {
    parsed.issues.push(error('"version" must be a whole number, starting at 1.'));
  } else if (value.version > FORMAT_VERSION) {
    parsed.issues.push(
      error(`This file is version ${value.version} of the format, which is newer than this app reads (version ${FORMAT_VERSION}). Ask for version ${FORMAT_VERSION}, or update the app.`)
    );
  }
  parsed.issues.push(...unknownKeys(value, QUIZ_KEYS, "The file"));
  readSettings(value.quiz, parsed);

  if (isRecord(value.levels)) {
    for (const key of Object.keys(value.levels)) {
      if (!isLevel(key)) parsed.issues.push(error(`"${key}" is not a level. Use ${LEVELS.map((name) => `"${name}"`).join(", ")}.`));
    }
    for (const level of LEVELS) {
      const entry = value.levels[level];
      if (entry === undefined || entry === null) continue;
      if (!isRecord(entry)) {
        parsed.issues.push(error(`${LEVEL_LABELS[level]}: expected an object with "questions".`));
        continue;
      }
      readLevel(entry, level, parsed);
    }
    const total = LEVELS.reduce((sum, level) => sum + (parsed.levels[level]?.rows.length ?? 0), 0);
    if (total === 0 && !parsed.issues.some((issue) => issue.severity === "error")) {
      parsed.issues.push(error("The file has no questions in it."));
    }
  }
  return parsed;
}
