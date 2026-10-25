/** A question as the server keeps it for one attempt: complete, with the answer key. Never sent as is. */
export interface StoredQuestion {
  id: string;
  text: string;
  options: string[];
  /** Null when the data names no right option (it then never counts as correct). */
  correctIndex: number | null;
  imageUrl?: string;
  explanation?: string;
}

const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : value == null ? fallback : String(value);

/**
 * Turns a stored question document into a `StoredQuestion`. Quizzes were saved in several shapes:
 * options as objects with `isCorrect` flags (what the editor writes now), as bare strings with a
 * `correctIndex`, or as numbered fields. Option flags win; `correctIndex` is the fallback.
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

  let correctIndex: number | null = rawOptions.findIndex(
    (option) =>
      !!option &&
      typeof option === "object" &&
      (option as { isCorrect?: unknown }).isCorrect === true
  );
  if (correctIndex < 0) {
    const legacy = data.correctIndex;
    correctIndex =
      typeof legacy === "number" &&
      Number.isInteger(legacy) &&
      legacy >= 0 &&
      legacy < options.length
        ? legacy
        : null;
  }

  const question: StoredQuestion = {
    id,
    text: asText(data.text),
    options,
    correctIndex,
  };
  if (typeof data.imageUrl === "string" && data.imageUrl) {
    question.imageUrl = data.imageUrl;
  }
  if (typeof data.explanation === "string" && data.explanation) {
    question.explanation = data.explanation;
  }
  return question;
}
