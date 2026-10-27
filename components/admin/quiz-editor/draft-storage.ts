import {
  EXAM_MODES,
  LEVELS,
  QUESTION_TYPES,
  type EditorOption,
  type EditorQuestion,
  type ExamMode,
} from "@/lib/quiz-schema";
import { blankForm, draftQuestion, type FormState } from "./editor-state";

// A copy of the editor's unsaved work on this device, so a closed laptop, a crashed tab or an accidental
// navigation doesn't lose it. It lives in localStorage under `ageno:admin:draft:<quizId|new>`; the server
// never sees it, and every read and write is allowed to fail (private window, blocked or full storage).

const PREFIX = "ageno:admin:draft:";
const VERSION = 1;

export const draftKey = (quizId: string | null) => `${PREFIX}${quizId ?? "new"}`;

export interface StoredDraft {
  /** When the copy was written (epoch ms). */
  savedAt: number;
  /** The quiz's `version` when the editor opened it (0 for a new quiz). */
  baseVersion: number;
  form: FormState;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);

function readOption(raw: unknown): EditorOption | null {
  if (!isRecord(raw)) return null;
  const option: EditorOption = { text: text(raw.text), isCorrect: raw.isCorrect === true };
  if (typeof raw.rationale === "string") option.rationale = raw.rationale;
  return option;
}

function readQuestion(raw: unknown): EditorQuestion | null {
  if (!isRecord(raw) || !Array.isArray(raw.options)) return null;
  const options = raw.options.map(readOption).filter((option): option is EditorOption => option !== null);
  if (options.length === 0) return null;
  const question: EditorQuestion = {
    type: (QUESTION_TYPES as readonly unknown[]).includes(raw.type) ? (raw.type as EditorQuestion["type"]) : "single",
    text: text(raw.text),
    options,
  };
  if (typeof raw.id === "string") question.id = raw.id;
  if (typeof raw.explanation === "string") question.explanation = raw.explanation;
  if (typeof raw.imageUrl === "string") question.imageUrl = raw.imageUrl;
  return question;
}

/** Turns what was stored back into a form, or null when it isn't one. Anything unreadable is dropped, never thrown. */
export function formFromStored(raw: unknown): FormState | null {
  if (!isRecord(raw) || !isRecord(raw.levels)) return null;
  const form = blankForm();
  form.title = text(raw.title);
  form.description = text(raw.description);
  form.duration = text(raw.duration, form.duration);
  form.accessCode = text(raw.accessCode);
  form.requiresAccessCode = flag(raw.requiresAccessCode, form.requiresAccessCode);
  form.isPublic = flag(raw.isPublic, form.isPublic);
  form.active = flag(raw.active, form.active);
  form.isAutoCheck = flag(raw.isAutoCheck, form.isAutoCheck);
  form.showAnswerReview = flag(raw.showAnswerReview, form.showAnswerReview);
  form.examMode = (EXAM_MODES as readonly unknown[]).includes(raw.examMode) ? (raw.examMode as ExamMode) : form.examMode;
  for (const level of LEVELS) {
    const stored = raw.levels[level];
    if (!isRecord(stored)) continue;
    form.levels[level] = {
      duration: text(stored.duration, form.levels[level].duration),
      pointsMultiplier: text(stored.pointsMultiplier, form.levels[level].pointsMultiplier),
      questions: (Array.isArray(stored.questions) ? stored.questions : [])
        .map(readQuestion)
        .filter((question): question is EditorQuestion => question !== null)
        .map((question) => draftQuestion(question)),
    };
  }
  return form;
}

/** The form without the React keys, which mean nothing outside this page. */
const formToStored = (form: FormState) => ({
  ...form,
  levels: Object.fromEntries(
    LEVELS.map((level) => [
      level,
      {
        ...form.levels[level],
        questions: form.levels[level].questions.map(({ key, ...question }) => {
          void key;
          return question;
        }),
      },
    ])
  ),
});

/** Reads the copy kept for this quiz, or null when there is none or it can't be read. */
export function loadDraft(quizId: string | null): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(quizId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.v !== VERSION) return null;
    const form = formFromStored(parsed.form);
    if (!form) return null;
    return {
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
      baseVersion: typeof parsed.baseVersion === "number" ? parsed.baseVersion : 0,
      form,
    };
  } catch {
    return null;
  }
}

/** Keeps a copy. Returns false when the browser refused (storage blocked or full), so the page can say so. */
export function saveDraft(quizId: string | null, form: FormState, baseVersion: number, now = Date.now()): boolean {
  try {
    window.localStorage.setItem(
      draftKey(quizId),
      JSON.stringify({ v: VERSION, savedAt: now, baseVersion, form: formToStored(form) })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(quizId: string | null): void {
  try {
    window.localStorage.removeItem(draftKey(quizId));
  } catch {
    // Nothing to clean up if storage isn't there.
  }
}
