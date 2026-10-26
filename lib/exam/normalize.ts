export const QUESTION_TYPES = ["single", "multiple"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** A question as the server keeps it for one attempt: complete, with the answer key. Never sent as is. */
export interface StoredQuestion {
  id: string;
  text: string;
  options: string[];
  /** `single`: exactly one right option. `multiple`: the picked set must equal the right set. */
  type: QuestionType;
  /** Right options, sorted. Empty when the data names none (it then never counts as correct). */
  correct: number[];
  /** Why each option is right or wrong, by option position; only present when at least one has a reason. */
  rationales?: (string | null)[];
  imageUrl?: string;
  explanation?: string;
}

const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : value == null ? fallback : String(value);

const isIndex = (value: unknown, optionCount: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < optionCount;

/** Sorted, unique, in range. Anything else in the list is dropped. */
export function cleanIndexes(value: unknown, optionCount: number): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  for (const item of value) if (isIndex(item, optionCount)) seen.add(item);
  return [...seen].sort((a, b) => a - b);
}

/** `rationales` only when there is something to say, with blanks as null so positions stay aligned. */
function cleanRationales(values: unknown[], optionCount: number): (string | null)[] | undefined {
  const list = Array.from({ length: optionCount }, (_, index) => {
    const value = values[index];
    return typeof value === "string" && value.trim() ? value : null;
  });
  return list.some((value) => value !== null) ? list : undefined;
}

const typeFor = (declared: unknown, correct: number[]): QuestionType =>
  declared === "multiple" || correct.length > 1 ? "multiple" : "single";

/**
 * Turns a stored question document into a `StoredQuestion`. Quizzes were saved in several shapes:
 * options as objects with `isCorrect` flags and optional `rationale` (what the editor writes now), as bare
 * strings with a `correctIndex`, or as numbered fields. Option flags win; `correctIndex` is the fallback.
 * More than one right option makes the question `multiple` whatever `type` says, so it can always be
 * answered in full.
 */
export function normalizeQuestion(
  id: string,
  data: Record<string, unknown>
): StoredQuestion {
  let rawOptions: unknown[] = Array.isArray(data.options) ? data.options : [];

  if (rawOptions.length === 0) {
    const numericKeys = Object.keys(data)
      .filter((key) => key.trim() !== "" && !isNaN(Number(key)))
      .sort((a, b) => Number(a) - Number(b));
    rawOptions = numericKeys.map((key) => data[key]);
  }

  const options = rawOptions.map((option, index) => {
    if (typeof option === "string") return option;
    if (option && typeof option === "object") {
      const text = (option as { text?: unknown }).text;
      return text == null || text === "" ? `Option ${index + 1}` : asText(text);
    }
    return option == null ? `Option ${index + 1}` : String(option);
  });

  let correct = rawOptions.flatMap((option, index) =>
    !!option && typeof option === "object" && (option as { isCorrect?: unknown }).isCorrect === true
      ? [index]
      : []
  );
  if (correct.length === 0 && isIndex(data.correctIndex, options.length)) {
    correct = [data.correctIndex];
  }

  const question: StoredQuestion = {
    id,
    text: asText(data.text),
    options,
    type: typeFor(data.type, correct),
    correct,
  };
  const rationales = cleanRationales(
    rawOptions.map((option) =>
      option && typeof option === "object" ? (option as { rationale?: unknown }).rationale : undefined
    ),
    options.length
  );
  if (rationales) question.rationales = rationales;
  if (typeof data.imageUrl === "string" && data.imageUrl) {
    question.imageUrl = data.imageUrl;
  }
  if (typeof data.explanation === "string" && data.explanation) {
    question.explanation = data.explanation;
  }
  return question;
}

/**
 * Reads a question out of an attempt document. Attempts that were running when the answer key became a
 * list hold the older shape (`correctIndex: number | null`, no `type`), and they must still finish.
 */
export function upgradeStoredQuestion(raw: unknown): StoredQuestion {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const options = Array.isArray(data.options) ? data.options.map((option) => asText(option)) : [];
  const correct = Array.isArray(data.correct)
    ? cleanIndexes(data.correct, options.length)
    : isIndex(data.correctIndex, options.length)
      ? [data.correctIndex]
      : [];

  const question: StoredQuestion = {
    id: asText(data.id),
    text: asText(data.text),
    options,
    type: typeFor(data.type, correct),
    correct,
  };
  if (Array.isArray(data.rationales)) {
    const rationales = cleanRationales(data.rationales, options.length);
    if (rationales) question.rationales = rationales;
  }
  if (typeof data.imageUrl === "string" && data.imageUrl) question.imageUrl = data.imageUrl;
  if (typeof data.explanation === "string" && data.explanation) question.explanation = data.explanation;
  return question;
}
