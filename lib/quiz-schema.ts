import { normalizeQuestion } from "./exam/normalize";

// The one description of a quiz as an admin edits it and as it is stored. Pure code (no Firebase), so the
// editor in the browser and the admin routes on the server validate and convert the same way.
//
// Stored shape (the only one written): `quizzes/{id}` plus one subcollection per level,
// `quizzes/{id}/questions_{easy|medium|hard}`, each document
//   { text, options: [{ text, isCorrect }], points: 1, type: "single", order, imageUrl?, explanation? }
// Older quizzes may still hold `questions` (one collection for every level) or string options with a
// `correctIndex`; `normalizeQuestion` reads those and `planLegacyQuestions` moves them over.

export const LEVELS = ["easy", "medium", "hard"] as const;
export type Level = (typeof LEVELS)[number];

export const isLevel = (value: unknown): value is Level =>
  typeof value === "string" && (LEVELS as readonly string[]).includes(value);

export const LEVEL_LABELS: Record<Level, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const LIMITS = {
  title: 200,
  description: 5000,
  questionText: 2000,
  optionText: 1000,
  explanation: 2000,
  imageUrl: 2000,
  minOptions: 2,
  maxOptions: 10,
  /** One attempt copies a level's questions into a single document and submits one write per answer. */
  maxQuestionsPerLevel: 400,
  minMinutes: 1,
  maxMinutes: 600,
  minMultiplier: 1,
  maxMultiplier: 5,
} as const;

export const EXAM_MODES = ["practice", "strict"] as const;
export type ExamMode = (typeof EXAM_MODES)[number];

export interface EditorOption {
  text: string;
  isCorrect: boolean;
}

export interface EditorQuestion {
  /** Missing on a new question; the server hands out the id. */
  id?: string;
  text: string;
  options: EditorOption[];
  imageUrl?: string;
  explanation?: string;
}

export interface LevelInput {
  /** Minutes. */
  duration: number;
  /** At least 1: the score is raw percent times this, capped at 100. */
  pointsMultiplier: number;
  questions: EditorQuestion[];
}

/** What an admin sends to create a quiz or to save one. A level with no questions is simply left out. */
export interface QuizInput {
  title: string;
  description: string;
  /** Default minutes; a level can override it. */
  duration: number;
  /** Blank on input means "make one"; stored quizzes always have a code. */
  accessCode: string;
  requiresAccessCode: boolean;
  isPublic: boolean;
  active: boolean;
  isAutoCheck: boolean;
  showAnswerReview: boolean;
  examMode: ExamMode;
  levels: Partial<Record<Level, LevelInput>>;
}

/** A row of the admin quiz list. */
export interface AdminQuizSummary {
  id: string;
  title: string;
  description: string;
  accessCode: string;
  requiresAccessCode: boolean;
  isPublic: boolean;
  active: boolean;
  isAutoCheck: boolean;
  examMode: ExamMode;
  duration: number;
  /** Questions per level (only levels that have some). */
  counts: Partial<Record<Level, number>>;
  responseCount: number;
  createdAt: number;
}

/** One quiz opened for editing, answer key included. `version` goes back with the save. */
export interface AdminQuizDetail extends QuizInput {
  id: string;
  /** The quiz's last-changed time (epoch ms). A save carrying an older one is refused. */
  version: number;
  createdAt: number;
  createdBy: string;
  responseCount: number;
}

export interface ValidationIssue {
  message: string;
  level?: Level;
  /** 0-based index of the question inside its level. */
  question?: number;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ACCESS_CODE = /^[A-Z0-9]{4,10}$/;
// No 0/O, 1/I/L: codes get read out and typed by hand.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const normalizeAccessCode = (value: string): string =>
  value.replace(/\s+/g, "").toUpperCase();

/** `random(n)` returns an integer in [0, n). The server passes `crypto.randomInt`, the browser its own. */
export function makeAccessCode(random: (max: number) => number, length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  return code;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** Where an issue happened, for the message ("Easy · Question 3: ..."). */
const where = (level: Level, question: number) =>
  `${LEVEL_LABELS[level]} · Question ${question + 1}`;

export function blankQuestion(): EditorQuestion {
  return {
    text: "",
    options: [
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };
}

function validateQuestion(
  raw: unknown,
  level: Level,
  index: number,
  issues: ValidationIssue[]
): EditorQuestion | null {
  const here = where(level, index);
  const fail = (message: string) => issues.push({ message: `${here}: ${message}`, level, question: index });

  if (!isRecord(raw)) {
    fail("this question is not valid.");
    return null;
  }
  const before = issues.length;

  const question: EditorQuestion = { text: "", options: [] };

  if (raw.id !== undefined && raw.id !== null && raw.id !== "") {
    if (typeof raw.id === "string" && SAFE_ID.test(raw.id)) question.id = raw.id;
    else fail("its id is not valid.");
  }

  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) fail("write the question.");
  else if (text.length > LIMITS.questionText) fail(`keep the question under ${LIMITS.questionText} characters.`);
  question.text = text;

  if (!Array.isArray(raw.options)) {
    fail("add the answer options.");
  } else if (raw.options.length < LIMITS.minOptions || raw.options.length > LIMITS.maxOptions) {
    fail(`use between ${LIMITS.minOptions} and ${LIMITS.maxOptions} options.`);
  } else {
    let correct = 0;
    raw.options.forEach((option, optionIndex) => {
      const optionText = isRecord(option) && typeof option.text === "string" ? option.text.trim() : "";
      const isCorrect = isRecord(option) && option.isCorrect === true;
      if (!optionText) fail(`option ${optionIndex + 1} is empty.`);
      else if (optionText.length > LIMITS.optionText) fail(`keep option ${optionIndex + 1} under ${LIMITS.optionText} characters.`);
      if (isCorrect) correct++;
      question.options.push({ text: optionText, isCorrect });
    });
    if (correct === 0) fail("pick the correct answer.");
    else if (correct > 1) fail("only one option can be correct.");
  }

  if (raw.explanation !== undefined && raw.explanation !== null && raw.explanation !== "") {
    const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";
    if (!explanation) {
      // Whitespace only: treated as not set.
    } else if (explanation.length > LIMITS.explanation) fail(`keep the explanation under ${LIMITS.explanation} characters.`);
    else question.explanation = explanation;
  }

  if (raw.imageUrl !== undefined && raw.imageUrl !== null && raw.imageUrl !== "") {
    const imageUrl = typeof raw.imageUrl === "string" ? raw.imageUrl.trim() : "";
    if (!imageUrl) {
      // Whitespace only: treated as not set.
    } else if (imageUrl.length > LIMITS.imageUrl || !isHttpsUrl(imageUrl)) fail("the image link must be a full https:// address.");
    else question.imageUrl = imageUrl;
  }

  return issues.length === before ? question : null;
}

const asInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

function validateLevel(
  raw: unknown,
  level: Level,
  issues: ValidationIssue[]
): LevelInput | null {
  const label = LEVEL_LABELS[level];
  if (!isRecord(raw)) {
    issues.push({ message: `${label}: this level is not valid.`, level });
    return null;
  }
  const before = issues.length;

  const duration = asInteger(raw.duration);
  if (duration === null || duration < LIMITS.minMinutes || duration > LIMITS.maxMinutes) {
    issues.push({
      message: `${label}: set a time limit between ${LIMITS.minMinutes} and ${LIMITS.maxMinutes} minutes.`,
      level,
    });
  }
  const multiplier = raw.pointsMultiplier;
  if (
    typeof multiplier !== "number" ||
    !Number.isFinite(multiplier) ||
    multiplier < LIMITS.minMultiplier ||
    multiplier > LIMITS.maxMultiplier
  ) {
    issues.push({
      message: `${label}: the points multiplier must be between ${LIMITS.minMultiplier} and ${LIMITS.maxMultiplier}.`,
      level,
    });
  }

  if (!Array.isArray(raw.questions)) {
    issues.push({ message: `${label}: questions are missing.`, level });
    return null;
  }
  if (raw.questions.length > LIMITS.maxQuestionsPerLevel) {
    issues.push({
      message: `${label}: a level can have up to ${LIMITS.maxQuestionsPerLevel} questions.`,
      level,
    });
    return null;
  }

  const questions: EditorQuestion[] = [];
  const seen = new Set<string>();
  raw.questions.forEach((item, index) => {
    const question = validateQuestion(item, level, index, issues);
    if (!question) return;
    if (question.id) {
      if (seen.has(question.id)) {
        issues.push({ message: `${where(level, index)}: it repeats another question's id.`, level, question: index });
        return;
      }
      seen.add(question.id);
    }
    questions.push(question);
  });

  if (issues.length > before) return null;
  return {
    duration: duration as number,
    pointsMultiplier: Math.round((multiplier as number) * 100) / 100,
    questions,
  };
}

const readBoolean = (
  raw: Record<string, unknown>,
  key: string,
  fallback: boolean,
  label: string,
  issues: ValidationIssue[]
): boolean => {
  const value = raw[key];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  issues.push({ message: `${label} must be on or off.` });
  return fallback;
};

/**
 * Checks what an admin sent and returns it cleaned (trimmed text, codes in capitals, empty levels left
 * out). The editor runs it before saving and the server runs it again; neither trusts the other.
 */
export function validateQuizInput(raw: unknown): ValidationResult<QuizInput> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(raw)) {
    return { ok: false, issues: [{ message: "The quiz is not valid." }] };
  }

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) issues.push({ message: "Give the quiz a title." });
  else if (title.length > LIMITS.title) issues.push({ message: `Keep the title under ${LIMITS.title} characters.` });

  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (raw.description !== undefined && typeof raw.description !== "string") {
    issues.push({ message: "The description must be text." });
  } else if (description.length > LIMITS.description) {
    issues.push({ message: `Keep the description under ${LIMITS.description} characters.` });
  }

  const duration = asInteger(raw.duration);
  if (duration === null || duration < LIMITS.minMinutes || duration > LIMITS.maxMinutes) {
    issues.push({
      message: `Set a default time limit between ${LIMITS.minMinutes} and ${LIMITS.maxMinutes} minutes.`,
    });
  }

  let accessCode = "";
  if (raw.accessCode !== undefined && raw.accessCode !== null) {
    accessCode = typeof raw.accessCode === "string" ? normalizeAccessCode(raw.accessCode) : "";
    if (typeof raw.accessCode !== "string" || (accessCode && !ACCESS_CODE.test(accessCode))) {
      issues.push({ message: "An access code is 4 to 10 letters or digits." });
    }
  }

  const requiresAccessCode = readBoolean(raw, "requiresAccessCode", false, "Require access code", issues);
  const isPublic = readBoolean(raw, "isPublic", true, "Listed on the join page", issues);
  const active = readBoolean(raw, "active", true, "Open for attempts", issues);
  const isAutoCheck = readBoolean(raw, "isAutoCheck", true, "Auto-check", issues);
  const showAnswerReview = readBoolean(raw, "showAnswerReview", true, "Show answer review", issues);

  let examMode: ExamMode = "practice";
  if (raw.examMode !== undefined) {
    if ((EXAM_MODES as readonly unknown[]).includes(raw.examMode)) examMode = raw.examMode as ExamMode;
    else issues.push({ message: "Exam mode must be practice or strict." });
  }

  const levels: Partial<Record<Level, LevelInput>> = {};
  if (!isRecord(raw.levels)) {
    issues.push({ message: "Add at least one question." });
  } else {
    for (const key of Object.keys(raw.levels)) {
      if (!isLevel(key)) issues.push({ message: `"${key}" is not a difficulty level.` });
    }
    let attempted = 0;
    for (const level of LEVELS) {
      const entry = raw.levels[level];
      if (entry === undefined || entry === null) continue;
      // A level with no questions is not part of the quiz, however it is configured.
      if (isRecord(entry) && Array.isArray(entry.questions) && entry.questions.length === 0) continue;
      attempted++;
      const value = validateLevel(entry, level, issues);
      if (value) levels[level] = value;
    }
    if (attempted === 0) issues.push({ message: "Add at least one question." });
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      title,
      description,
      duration: duration as number,
      accessCode,
      requiresAccessCode,
      isPublic,
      active,
      isAutoCheck,
      showAnswerReview,
      examMode,
      levels,
    },
  };
}

/** The levels that have questions, in the order players see them. */
export const levelsOf = (levels: QuizInput["levels"]): Level[] =>
  LEVELS.filter((level) => (levels[level]?.questions.length ?? 0) > 0);

/** A question as it is stored: always this shape, whatever the older one looked like. */
export interface QuestionDoc {
  text: string;
  options: { text: string; isCorrect: boolean }[];
  points: number;
  type: "single";
  order: number;
  imageUrl?: string;
  explanation?: string;
}

export function questionToDoc(question: EditorQuestion, order: number): QuestionDoc {
  return {
    text: question.text,
    options: question.options.map((option) => ({
      text: option.text,
      isCorrect: option.isCorrect,
    })),
    // Every question counts the same in the score; the field stays for older readers.
    points: 1,
    type: "single",
    order,
    ...(question.imageUrl ? { imageUrl: question.imageUrl } : {}),
    ...(question.explanation ? { explanation: question.explanation } : {}),
  };
}

/** A stored question (any of the older shapes) as the editor holds it. */
export function questionFromStored(id: string, data: Record<string, unknown>): EditorQuestion {
  const stored = normalizeQuestion(id, data);
  return {
    id,
    text: stored.text,
    options: stored.options.map((text, index) => ({
      text,
      isCorrect: index === stored.correctIndex,
    })),
    ...(stored.imageUrl ? { imageUrl: stored.imageUrl } : {}),
    ...(stored.explanation ? { explanation: stored.explanation } : {}),
  };
}

export interface StoredDoc {
  id: string;
  data: Record<string, unknown>;
}

/** Quiz order: by `order`, questions without one after those with, then by id (what Firestore returns). */
export function sortQuestionDocs<T extends StoredDoc>(docs: T[]): T[] {
  const orderOf = (doc: T) =>
    typeof doc.data.order === "number" && Number.isFinite(doc.data.order)
      ? doc.data.order
      : Number.POSITIVE_INFINITY;
  return [...docs].sort((a, b) => {
    const byOrder = orderOf(a) - orderOf(b);
    if (byOrder !== 0 && !Number.isNaN(byOrder)) return byOrder;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Where the questions of an old shared `questions` collection go. A document that names a level
 * (`difficulty`) belongs to that level; one that doesn't was shown at every level, so it is copied to each.
 * Levels that already have their own collection are left alone (that collection wins, as it does for players).
 */
export function planLegacyQuestions(
  legacy: StoredDoc[],
  levels: readonly Level[],
  levelsWithOwnQuestions: ReadonlySet<Level>
): Partial<Record<Level, StoredDoc[]>> {
  const plan: Partial<Record<Level, StoredDoc[]>> = {};
  for (const level of levels) {
    if (levelsWithOwnQuestions.has(level)) continue;
    const mine = legacy.filter((doc) => {
      const named = doc.data.difficulty;
      return isLevel(named) ? named === level : true;
    });
    if (mine.length > 0) plan[level] = sortQuestionDocs(mine);
  }
  return plan;
}

/** The questions of one level as plain JSON, for download. No ids: an import makes new questions. */
export function exportQuestions(questions: EditorQuestion[]): string {
  return JSON.stringify(
    questions.map((question) => ({
      text: question.text,
      options: question.options.map((option) => ({
        text: option.text,
        isCorrect: option.isCorrect,
      })),
      ...(question.explanation ? { explanation: question.explanation } : {}),
      ...(question.imageUrl ? { imageUrl: question.imageUrl } : {}),
    })),
    null,
    2
  );
}

export type ImportResult =
  | { ok: true; questions: EditorQuestion[] }
  | { ok: false; message: string };

/**
 * Reads pasted or uploaded JSON: a list of questions (or `{ "questions": [...] }`). Options may be plain
 * strings with a `correctIndex`, or `{ text, isCorrect }` objects, which is what the export writes.
 */
export function parseImportedQuestions(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "That isn't valid JSON. Paste the list of questions exactly as exported." };
  }
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.questions)
      ? parsed.questions
      : null;
  if (!list) {
    return { ok: false, message: "Expected a list of questions." };
  }
  if (list.length === 0) return { ok: false, message: "The list has no questions in it." };
  if (list.length > LIMITS.maxQuestionsPerLevel) {
    return { ok: false, message: `A level can have up to ${LIMITS.maxQuestionsPerLevel} questions.` };
  }

  const questions: EditorQuestion[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!isRecord(item) || typeof item.text !== "string" || !Array.isArray(item.options)) {
      return { ok: false, message: `Question ${i + 1} needs "text" and "options".` };
    }
    const question = questionFromStored("import", item);
    delete question.id;
    questions.push(question);
  }
  return { ok: true, questions };
}
