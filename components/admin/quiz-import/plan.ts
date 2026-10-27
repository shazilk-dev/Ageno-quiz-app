import { applyImport, describeDiff, diffQuestions, type ImportMode, type QuestionDiff } from "@/lib/quiz-import/apply";
import {
  LEVELS,
  validateQuizInput,
  type AdminQuizDetail,
  type EditorQuestion,
  type Level,
  type LevelInput,
  type QuizInput,
  type ValidationIssue,
} from "@/lib/quiz-schema";
import type { FormState } from "@/components/admin/quiz-editor/editor-state";

// What importing does to a quiz, worked out before anything is saved: the quiz as it would be saved, and for
// each level how many questions are new, changed, removed and unchanged.

export type Target =
  | {
      kind: "new";
      /** Players can start it as soon as it exists. Off by default: an imported quiz is worth a look first. */
      openNow: boolean;
    }
  | { kind: "existing"; detail: AdminQuizDetail; mode: ImportMode };

export interface LevelPlan {
  level: Level;
  /** Questions in the file for this level that will be imported. */
  incoming: number;
  before: number;
  after: number;
  diff: QuestionDiff;
  text: string;
}

export interface ImportPlan {
  /** The quiz to save, checked with the same rules the server uses. */
  input: QuizInput | null;
  /** Why it can't be saved yet (a missing title, too many questions, ...). */
  problems: ValidationIssue[];
  levels: LevelPlan[];
  /** The quiz as it was before, for undoing a save that didn't finish. Null for a new quiz. */
  before: QuizInput | null;
  total: QuestionDiff;
}

const numberOr = (text: string, fallback: number) => {
  const value = Number(text);
  return Number.isFinite(value) && text.trim() !== "" ? value : fallback;
};

function inputOf(detail: AdminQuizDetail): QuizInput {
  return {
    title: detail.title,
    description: detail.description,
    duration: detail.duration,
    accessCode: detail.accessCode,
    requiresAccessCode: detail.requiresAccessCode,
    isPublic: detail.isPublic,
    active: detail.active,
    isAutoCheck: detail.isAutoCheck,
    showAnswerReview: detail.showAnswerReview,
    examMode: detail.examMode,
    levels: detail.levels,
  };
}

export function planImport(
  form: FormState,
  incoming: Partial<Record<Level, EditorQuestion[]>>,
  target: Target
): ImportPlan {
  const levels: LevelPlan[] = [];
  const total: QuestionDiff = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  const levelInputs: QuizInput["levels"] = {};
  let raw: Record<string, unknown>;
  let before: QuizInput | null = null;

  const record = (level: Level, current: readonly EditorQuestion[], next: readonly EditorQuestion[], count: number) => {
    const diff = diffQuestions(current, next);
    total.added += diff.added;
    total.changed += diff.changed;
    total.removed += diff.removed;
    total.unchanged += diff.unchanged;
    levels.push({ level, incoming: count, before: current.length, after: next.length, diff, text: describeDiff(diff) });
  };

  if (target.kind === "new") {
    for (const level of LEVELS) {
      const questions = incoming[level] ?? [];
      if (questions.length === 0) continue;
      const draft = form.levels[level];
      levelInputs[level] = {
        duration: numberOr(draft.duration, 30),
        pointsMultiplier: numberOr(draft.pointsMultiplier, 1),
        questions,
      };
      record(level, [], questions, questions.length);
    }
    raw = {
      title: form.title,
      description: form.description,
      duration: numberOr(form.duration, 30),
      accessCode: "",
      requiresAccessCode: form.requiresAccessCode,
      isPublic: form.isPublic,
      active: target.openNow,
      isAutoCheck: form.isAutoCheck,
      showAnswerReview: form.showAnswerReview,
      examMode: form.examMode,
      levels: levelInputs,
    };
  } else {
    const { detail, mode } = target;
    before = inputOf(detail);
    for (const level of LEVELS) {
      const current = detail.levels[level];
      const files = incoming[level];
      if (!files || files.length === 0) {
        if (current) levelInputs[level] = current;
        continue;
      }
      const next = applyImport(current?.questions ?? [], files, mode);
      const draft = form.levels[level];
      const entry: LevelInput = {
        duration: current?.duration ?? numberOr(draft.duration, detail.duration),
        pointsMultiplier: current?.pointsMultiplier ?? numberOr(draft.pointsMultiplier, 1),
        questions: next,
      };
      levelInputs[level] = entry;
      record(level, current?.questions ?? [], next, files.length);
    }
    raw = { ...before, levels: levelInputs };
  }

  const checked = validateQuizInput(raw);
  return {
    input: checked.ok ? checked.value : null,
    problems: checked.ok ? [] : checked.issues,
    levels,
    before,
    total,
  };
}
