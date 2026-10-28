import { isFenceEnd, isFenceStart } from "@/lib/rich-text/parse";
import type { EditorQuestion } from "@/lib/quiz-schema";

// AIs and word processors write a line break as `<br>`, which the player would see as text. The readers turn
// it into a real line break and say so. Inside a table row a line break would end the row, so there it
// becomes a space. Code blocks are left alone.

const BREAK_TEST = /<br\s*\/?>/i;
const BREAK_ALL = /<br\s*\/?>/gi;

export function replaceBreakTags(text: string): string {
  if (!BREAK_TEST.test(text)) return text;
  let fence = false;
  return text
    .split("\n")
    .map((line) => {
      if (fence) {
        if (isFenceEnd(line)) fence = false;
        return line;
      }
      if (isFenceStart(line)) {
        fence = true;
        return line;
      }
      return line.includes("|") ? line.replace(BREAK_ALL, " ") : line.replace(BREAK_ALL, "\n");
    })
    .join("\n");
}

/** Converts every text of a question in place. True when anything changed. */
export function convertBreakTags(question: EditorQuestion): boolean {
  let changed = false;
  const fix = (value: string | undefined): string | undefined => {
    if (value === undefined) return value;
    const next = replaceBreakTags(value);
    if (next !== value) changed = true;
    return next;
  };
  question.text = fix(question.text) as string;
  if (question.explanation !== undefined) question.explanation = fix(question.explanation);
  for (const option of question.options) {
    option.text = fix(option.text) as string;
    if (option.rationale !== undefined) option.rationale = fix(option.rationale);
  }
  return changed;
}
