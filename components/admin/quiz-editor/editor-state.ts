import {
  LEVELS,
  blankQuestion,
  validateQuizInput,
  type AdminQuizDetail,
  type EditorQuestion,
  type ExamMode,
  type Level,
  type QuestionType,
  type QuizInput,
  type ValidationResult,
} from "@/lib/quiz-schema";

// The editor's form state. Numbers are held as text while typing (an empty box is not 0) and turned into
// numbers by `toInput`, which is also what gets validated and sent.

export interface DraftQuestion extends EditorQuestion {
  /** Stable React key; never sent to the server. */
  key: string;
}

export interface DraftLevel {
  duration: string;
  pointsMultiplier: string;
  questions: DraftQuestion[];
}

export interface FormState {
  title: string;
  description: string;
  duration: string;
  accessCode: string;
  requiresAccessCode: boolean;
  isPublic: boolean;
  active: boolean;
  isAutoCheck: boolean;
  showAnswerReview: boolean;
  examMode: ExamMode;
  levels: Record<Level, DraftLevel>;
}

let keyCounter = 0;
export const newKey = () => `draft-${++keyCounter}`;

export const draftQuestion = (question: EditorQuestion = blankQuestion()): DraftQuestion => ({
  ...question,
  key: newKey(),
});

const DEFAULT_LEVELS: Record<Level, { duration: string; pointsMultiplier: string }> = {
  easy: { duration: "30", pointsMultiplier: "1" },
  medium: { duration: "25", pointsMultiplier: "1.5" },
  hard: { duration: "20", pointsMultiplier: "2" },
};

export function blankForm(): FormState {
  return {
    title: "",
    description: "",
    duration: "30",
    accessCode: "",
    requiresAccessCode: false,
    isPublic: true,
    active: true,
    isAutoCheck: true,
    showAnswerReview: true,
    examMode: "practice",
    levels: {
      easy: { ...DEFAULT_LEVELS.easy, questions: [] },
      medium: { ...DEFAULT_LEVELS.medium, questions: [] },
      hard: { ...DEFAULT_LEVELS.hard, questions: [] },
    },
  };
}

export function formFromDetail(detail: AdminQuizDetail): FormState {
  const form = blankForm();
  form.title = detail.title;
  form.description = detail.description;
  form.duration = String(detail.duration);
  form.accessCode = detail.accessCode;
  form.requiresAccessCode = detail.requiresAccessCode;
  form.isPublic = detail.isPublic;
  form.active = detail.active;
  form.isAutoCheck = detail.isAutoCheck;
  form.showAnswerReview = detail.showAnswerReview;
  form.examMode = detail.examMode;
  for (const level of LEVELS) {
    const stored = detail.levels[level];
    if (!stored) continue;
    form.levels[level] = {
      duration: String(stored.duration),
      pointsMultiplier: String(stored.pointsMultiplier),
      questions: stored.questions.map((question) => draftQuestion(question)),
    };
  }
  return form;
}

/** What gets validated and sent. Anything that isn't a number comes out as NaN and fails validation. */
export function toInput(form: FormState): unknown {
  const levels: Record<string, unknown> = {};
  for (const level of LEVELS) {
    const draft = form.levels[level];
    levels[level] = {
      duration: Number(draft.duration),
      pointsMultiplier: Number(draft.pointsMultiplier),
      questions: draft.questions.map(({ key, ...question }) => {
        void key;
        return question;
      }),
    };
  }
  return {
    title: form.title,
    description: form.description,
    duration: Number(form.duration),
    accessCode: form.accessCode,
    requiresAccessCode: form.requiresAccessCode,
    isPublic: form.isPublic,
    active: form.active,
    isAutoCheck: form.isAutoCheck,
    showAnswerReview: form.showAnswerReview,
    examMode: form.examMode,
    levels,
  };
}

export const validateForm = (form: FormState): ValidationResult<QuizInput> =>
  validateQuizInput(toInput(form));

/** A comparable snapshot, to tell whether anything changed since the quiz was loaded or last saved. */
export const snapshotOf = (form: FormState): string => JSON.stringify(toInput(form));

type ScalarField =
  | "title"
  | "description"
  | "duration"
  | "accessCode"
  | "requiresAccessCode"
  | "isPublic"
  | "active"
  | "isAutoCheck"
  | "showAnswerReview"
  | "examMode";

export type EditorAction =
  | { type: "load"; form: FormState }
  | { type: "field"; name: ScalarField; value: string | boolean }
  | { type: "levelField"; level: Level; name: "duration" | "pointsMultiplier"; value: string }
  | { type: "addQuestion"; level: Level; key: string }
  | { type: "removeQuestion"; level: Level; key: string }
  | { type: "moveQuestion"; level: Level; key: string; by: -1 | 1 }
  | { type: "duplicateQuestion"; level: Level; key: string; newKey: string }
  | { type: "editQuestion"; level: Level; key: string; patch: Partial<Pick<EditorQuestion, "text" | "explanation" | "imageUrl">> }
  | { type: "optionText"; level: Level; key: string; index: number; value: string }
  | { type: "optionRationale"; level: Level; key: string; index: number; value: string }
  | { type: "setCorrect"; level: Level; key: string; index: number }
  | { type: "toggleCorrect"; level: Level; key: string; index: number }
  /** `keep`: when going to single with several right options, the one that stays right. */
  | { type: "setType"; level: Level; key: string; questionType: QuestionType; keep?: number }
  | { type: "addOption"; level: Level; key: string }
  | { type: "removeOption"; level: Level; key: string; index: number }
  | { type: "importQuestions"; level: Level; questions: DraftQuestion[]; mode: "append" | "replace" };

const withQuestion = (
  state: FormState,
  level: Level,
  key: string,
  change: (question: DraftQuestion) => DraftQuestion
): FormState => ({
  ...state,
  levels: {
    ...state.levels,
    [level]: {
      ...state.levels[level],
      questions: state.levels[level].questions.map((question) =>
        question.key === key ? change(question) : question
      ),
    },
  },
});

const withQuestions = (state: FormState, level: Level, questions: DraftQuestion[]): FormState => ({
  ...state,
  levels: { ...state.levels, [level]: { ...state.levels[level], questions } },
});

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;

export function editorReducer(state: FormState, action: EditorAction): FormState {
  switch (action.type) {
    case "load":
      return action.form;
    case "field":
      return { ...state, [action.name]: action.value };
    case "levelField":
      return {
        ...state,
        levels: {
          ...state.levels,
          [action.level]: { ...state.levels[action.level], [action.name]: action.value },
        },
      };
    case "addQuestion":
      return withQuestions(state, action.level, [
        ...state.levels[action.level].questions,
        { ...blankQuestion(), key: action.key },
      ]);
    case "removeQuestion":
      return withQuestions(
        state,
        action.level,
        state.levels[action.level].questions.filter((question) => question.key !== action.key)
      );
    case "moveQuestion": {
      const list = [...state.levels[action.level].questions];
      const from = list.findIndex((question) => question.key === action.key);
      const to = from + action.by;
      if (from < 0 || to < 0 || to >= list.length) return state;
      [list[from], list[to]] = [list[to], list[from]];
      return withQuestions(state, action.level, list);
    }
    case "duplicateQuestion": {
      const list = state.levels[action.level].questions;
      const from = list.findIndex((question) => question.key === action.key);
      if (from < 0) return state;
      // A copy is a new question: it has no id until the server gives it one.
      const { id, ...rest } = list[from];
      void id;
      const copy: DraftQuestion = {
        ...rest,
        key: action.newKey,
        options: rest.options.map((option) => ({ ...option })),
      };
      return withQuestions(state, action.level, [...list.slice(0, from + 1), copy, ...list.slice(from + 1)]);
    }
    case "editQuestion":
      return withQuestion(state, action.level, action.key, (question) => ({ ...question, ...action.patch }));
    case "optionText":
      return withQuestion(state, action.level, action.key, (question) => ({
        ...question,
        options: question.options.map((option, i) =>
          i === action.index ? { ...option, text: action.value } : option
        ),
      }));
    case "optionRationale":
      return withQuestion(state, action.level, action.key, (question) => ({
        ...question,
        options: question.options.map((option, i) =>
          i === action.index ? { ...option, rationale: action.value } : option
        ),
      }));
    case "setCorrect":
      return withQuestion(state, action.level, action.key, (question) => ({
        ...question,
        options: question.options.map((option, i) => ({ ...option, isCorrect: i === action.index })),
      }));
    case "toggleCorrect":
      return withQuestion(state, action.level, action.key, (question) => ({
        ...question,
        options: question.options.map((option, i) =>
          i === action.index ? { ...option, isCorrect: !option.isCorrect } : option
        ),
      }));
    case "setType":
      return withQuestion(state, action.level, action.key, (question) => {
        if (question.type === action.questionType) return question;
        if (action.questionType === "multiple") return { ...question, type: "multiple" };
        // To single: one right option stays, the one the admin chose (or the first).
        const right = question.options.flatMap((option, i) => (option.isCorrect ? [i] : []));
        const keep = action.keep !== undefined && right.includes(action.keep) ? action.keep : right[0];
        return {
          ...question,
          type: "single",
          options: question.options.map((option, i) => ({ ...option, isCorrect: i === keep })),
        };
      });
    case "addOption":
      return withQuestion(state, action.level, action.key, (question) =>
        question.options.length >= MAX_OPTIONS
          ? question
          : { ...question, options: [...question.options, { text: "", isCorrect: false }] }
      );
    case "removeOption":
      return withQuestion(state, action.level, action.key, (question) =>
        question.options.length <= MIN_OPTIONS
          ? question
          : { ...question, options: question.options.filter((_, i) => i !== action.index) }
      );
    case "importQuestions":
      return withQuestions(
        state,
        action.level,
        action.mode === "replace"
          ? action.questions
          : [...state.levels[action.level].questions, ...action.questions]
      );
  }
}
