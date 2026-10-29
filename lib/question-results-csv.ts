import { csvCell } from "@/lib/admin-analytics";
import { picksMatch } from "@/lib/exam/answers";
import type { InsightAttempt, InsightQuestion } from "@/lib/item-analysis";

// One row per person and question, for an admin's own analysis in a spreadsheet (admin plan A5.5). Pure.

/** A file this large already strains a spreadsheet; past it the export stops and says so. */
export const MAX_CSV_ROWS = 100_000;

export interface CsvResult {
  /** The result's id: `/quiz-reports/<id>` opens it. */
  id: string;
  player: string;
  level: string;
  /** Epoch ms. */
  submittedAt: number | null;
  sheet: InsightAttempt["sheet"];
}

export interface QuestionResultsCsv {
  csv: string;
  rows: number;
  /** The export stopped at `MAX_CSV_ROWS`. */
  truncated: boolean;
}

const HEADER = [
  "Quiz",
  "Level",
  "Result",
  "Player",
  "Submitted (UTC)",
  "Question no.",
  "Question",
  "Picked",
  "Correct answer",
  "Outcome",
];

/** Excel reads a CSV as UTF-8 only when it starts with this mark. */
const BOM = String.fromCharCode(0xfeff);

const letters = (indexes: number[]) => indexes.map((i) => String.fromCharCode(65 + i)).join(", ");

/**
 * The rows for every result at every level, in the order given, questions in quiz order. A question left
 * unanswered is a row too (Outcome "skipped"), so the sheet can be pivoted without guessing what is missing.
 * "Correct answer" is the quiz's key as it is now; "Outcome" is what was recorded when the result was scored.
 * Starts with a byte order mark so Excel reads it as UTF-8.
 */
export function questionResultsCsv(
  quizTitle: string,
  levels: readonly { level: string; questions: readonly InsightQuestion[] }[],
  results: readonly CsvResult[],
  maxRows = MAX_CSV_ROWS
): QuestionResultsCsv {
  const lines: string[] = [HEADER.map(csvCell).join(",")];
  let rows = 0;
  let truncated = false;

  outer: for (const result of results) {
    const questions = levels.find((entry) => entry.level === result.level)?.questions ?? [];
    for (const [index, question] of questions.entries()) {
      if (rows >= maxRows) {
        truncated = true;
        break outer;
      }
      const entry = result.sheet[question.id];
      const picks =
        entry && Array.isArray(entry.p)
          ? entry.p.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < question.options.length)
          : [];
      const key = question.options.flatMap((option, i) => (option.isCorrect ? [i] : []));
      const outcome =
        picks.length === 0
          ? "skipped"
          : entry && typeof entry.ok === "boolean"
            ? entry.ok
              ? "right"
              : "wrong"
            : key.length === 0
              ? "not marked"
              : picksMatch(key, picks)
                ? "right"
                : "wrong";
      lines.push(
        [
          quizTitle,
          result.level,
          result.id,
          result.player,
          result.submittedAt === null ? "" : new Date(result.submittedAt).toISOString(),
          index + 1,
          question.label,
          letters(picks),
          letters(key),
          outcome,
        ]
          .map(csvCell)
          .join(",")
      );
      rows += 1;
    }
  }
  return { csv: BOM + lines.join("\r\n"), rows, truncated };
}
