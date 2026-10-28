import { parseRichText } from "./parse";

// What the parser and the table sizes say about the text fields of one question, as plain sentences. The
// editor's Checks panel (`lib/quiz-checks.ts`) and the import checks (`lib/quiz-format/checks.ts`, which the
// AI skill's validate.mjs runs too) both use it, so the three say the same thing. Advice only.

/** A table with more columns than this means sideways scrolling on a phone. */
export const WIDE_TABLE_COLUMNS = 6;
/** A table with more body rows than this is a lot to read in the middle of an exam. */
export const LONG_TABLE_ROWS = 25;

export interface FormattingAdvice {
  kind: "formatting" | "wide-table" | "long-table";
  message: string;
}

export interface QuestionTexts {
  text: string;
  explanation?: string;
  options: readonly { text: string; rationale?: string }[];
}

const letter = (index: number) => String.fromCharCode(65 + index);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Text with none of these cannot hold a table, a code block or an HTML tag, so there is nothing to look at. */
const MAY_HAVE_FORMATTING = /[|<`]/;

export function formattingAdvice(question: QuestionTexts): FormattingAdvice[] {
  const advice: FormattingAdvice[] = [];
  const fields: { label: string; text: string; blocks: "all" | "inline" }[] = [
    { label: "Question text", text: question.text, blocks: "all" },
    { label: "Explanation", text: question.explanation ?? "", blocks: "all" },
    ...question.options.flatMap((option, i) => [
      { label: `Option ${letter(i)}`, text: option.text, blocks: "inline" as const },
      { label: `Reason for option ${letter(i)}`, text: option.rationale ?? "", blocks: "inline" as const },
    ]),
  ];
  for (const { label, text, blocks } of fields) {
    if (!MAY_HAVE_FORMATTING.test(text)) continue;
    const { diagnostics, blocks: tree } = parseRichText(text, { blocks });
    if (diagnostics.length > 0) {
      const [first, ...rest] = diagnostics;
      const more = rest.length > 0 ? ` (${plural(rest.length, "more problem")} in this text.)` : "";
      const line = text.includes("\n") ? `, line ${first.line}` : "";
      advice.push({ kind: "formatting", message: `${label}${line}: ${first.message}${more}` });
    }
    for (const block of tree) {
      if (block.type !== "table") continue;
      const columns = block.header.length;
      if (columns > WIDE_TABLE_COLUMNS) {
        advice.push({
          kind: "wide-table",
          message: `${label} has a table with ${columns} columns. On a phone players scroll sideways past ${WIDE_TABLE_COLUMNS}; fewer columns, or two smaller tables, read better.`,
        });
      }
      if (block.rows.length > LONG_TABLE_ROWS) {
        advice.push({
          kind: "long-table",
          message: `${label} has a table with ${block.rows.length} rows. More than ${LONG_TABLE_ROWS} is a lot to read in an exam; consider splitting it.`,
        });
      }
    }
  }
  return advice;
}
