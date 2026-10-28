import { NONE_OR_ALL, textKey } from "@/lib/quiz-format/checks";
import { LEVELS, LEVEL_LABELS, type EditorQuestion, type Level } from "@/lib/quiz-schema";
import { formattingAdvice, LONG_TABLE_ROWS, WIDE_TABLE_COLUMNS } from "@/lib/rich-text/advice";

// The editor's "Checks" panel: things worth a second look in a quiz that is valid and could be saved as it
// is. Validation (`validateQuizInput`) says what is wrong; this says what looks careless: a repeated
// question, an answer that is usually in the same place, a time limit that leaves seconds per question.
// Pure and quick; it runs on every change to the draft. Advice only: nothing here ever blocks a save.

export type CheckCode =
  | "duplicate-question"
  | "duplicate-options"
  | "none-or-all"
  | "all-correct"
  | "multiple-one-right"
  | "answer-position"
  | "longest-is-right"
  | "no-explanation"
  | "tight-time"
  | "formatting"
  | "wide-table"
  | "long-table";

export interface QuizCheck {
  code: CheckCode;
  level: Level;
  /** 0-based indexes in the level the check is about; empty for a check about the whole level. */
  questions: number[];
  message: string;
}

export interface LevelForChecks {
  /** Minutes, as the level has it (or NaN while the box is empty). */
  duration: number;
  questions: readonly EditorQuestion[];
}

/** Below this many questions a pattern in answer positions is just chance. */
export const PATTERN_MIN_QUESTIONS = 8;
/** A position or a "longest option" that is the key this often is a giveaway. */
export const PATTERN_SHARE = 0.5;
export { LONG_TABLE_ROWS, WIDE_TABLE_COLUMNS };
/** Fewer seconds per question than this and a level is more a typing test than a quiz. */
export const MIN_SECONDS_PER_QUESTION = 20;

const letter = (index: number) => String.fromCharCode(65 + index);
const where = (level: Level, index: number) => `${LEVEL_LABELS[level]} · Question ${index + 1}`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** What the parser's advice and the table sizes say about the text fields of one question. */
const formattingChecks = (level: Level, index: number, question: EditorQuestion): QuizCheck[] =>
  formattingAdvice(question).map(({ kind, message }) => ({ code: kind, level, questions: [index], message }));

export function checkQuiz(levels: Record<Level, LevelForChecks>): QuizCheck[] {
  const checks: QuizCheck[] = [];

  // The same question anywhere in the quiz (a player takes one level, but an admin means each question once).
  const firstSeen = new Map<string, { level: Level; index: number }>();
  for (const level of LEVELS) {
    levels[level].questions.forEach((question, index) => {
      const key = textKey(question.text);
      if (!key) return;
      const first = firstSeen.get(key);
      if (!first) {
        firstSeen.set(key, { level, index });
        return;
      }
      checks.push({
        code: "duplicate-question",
        level,
        questions: [index],
        message: `Same question as ${where(first.level, first.index)}.`,
      });
    });
  }

  for (const level of LEVELS) {
    const { questions, duration } = levels[level];

    questions.forEach((question, index) => {
      checks.push(...formattingChecks(level, index, question));

      const texts = question.options.map((option) => textKey(option.text));
      const repeated = texts.findIndex((key, i) => key !== "" && texts.indexOf(key) !== i);
      if (repeated >= 0) {
        checks.push({
          code: "duplicate-options",
          level,
          questions: [index],
          message: `Options ${letter(texts.indexOf(texts[repeated]))} and ${letter(repeated)} say the same thing.`,
        });
      }

      const ofTheAbove = question.options.findIndex((option) => NONE_OR_ALL.test(option.text.trim()));
      if (ofTheAbove >= 0) {
        checks.push({
          code: "none-or-all",
          level,
          questions: [index],
          message: `Option ${letter(ofTheAbove)} is "${question.options[ofTheAbove].text.trim()}", which stops making sense when options are reordered.`,
        });
      }

      const right = question.options.filter((option) => option.isCorrect).length;
      if (question.type === "multiple" && question.options.length > 1 && right === question.options.length) {
        checks.push({
          code: "all-correct",
          level,
          questions: [index],
          message: "Every option is marked correct, so there is nothing to choose between.",
        });
      } else if (question.type === "multiple" && right === 1) {
        checks.push({
          code: "multiple-one-right",
          level,
          questions: [index],
          message: "Select-all question with one correct option. Players are told to choose 1; make it a one-answer question if that's what you mean.",
        });
      }
    });

    // Answer position and length, over one-answer questions with a clear key.
    const keyed = questions.filter(
      (question) => question.type === "single" && question.options.filter((option) => option.isCorrect).length === 1
    );
    if (keyed.length >= PATTERN_MIN_QUESTIONS) {
      const byPosition = new Map<number, number>();
      for (const question of keyed) {
        const position = question.options.findIndex((option) => option.isCorrect);
        byPosition.set(position, (byPosition.get(position) ?? 0) + 1);
      }
      const [position, count] = [...byPosition.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      if (count / keyed.length >= PATTERN_SHARE) {
        checks.push({
          code: "answer-position",
          level,
          questions: [],
          message: `In ${count} of ${keyed.length} one-answer questions the right answer is option ${letter(position)}. Players notice; spread them out.`,
        });
      }

      // Only questions where one option is clearly the longest count.
      let withLongest = 0;
      let longestIsRight = 0;
      for (const question of keyed) {
        const lengths = question.options.map((option) => option.text.trim().length);
        const max = Math.max(...lengths);
        if (lengths.filter((length) => length === max).length !== 1 || max === 0) continue;
        withLongest++;
        if (question.options[lengths.indexOf(max)].isCorrect) longestIsRight++;
      }
      if (withLongest >= PATTERN_MIN_QUESTIONS && longestIsRight / withLongest >= PATTERN_SHARE + 0.1) {
        checks.push({
          code: "longest-is-right",
          level,
          questions: [],
          message: `The longest option is the right one in ${longestIsRight} of ${withLongest} questions. Make the wrong answers as detailed as the right one.`,
        });
      }
    }

    const bare = questions.flatMap((question, index) =>
      !question.explanation?.trim() && !question.options.some((option) => option.rationale?.trim()) ? [index] : []
    );
    if (bare.length > 0) {
      checks.push({
        code: "no-explanation",
        level,
        questions: bare,
        message: `${plural(bare.length, "question")} ${bare.length === 1 ? "has" : "have"} no explanation and no reason on any option, so the review can only say right or wrong.`,
      });
    }

    if (questions.length > 0 && Number.isFinite(duration) && duration > 0) {
      const seconds = (duration * 60) / questions.length;
      if (seconds < MIN_SECONDS_PER_QUESTION) {
        checks.push({
          code: "tight-time",
          level,
          questions: [],
          message: `${plural(questions.length, "question")} in ${plural(duration, "minute")} is ${Math.round(seconds)} seconds each.`,
        });
      }
    }
  }

  return checks;
}
