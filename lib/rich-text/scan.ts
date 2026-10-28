import type { StoredQuestion } from "@/lib/exam/normalize";
import { parseRichText } from "./parse";
import { structureOf, toPlainText } from "./plain";

/** One piece of stored text that would look different once it goes through the rich-text renderer. */
export interface RichTextHit {
  /** `"question"`, `"explanation"`, `"option A"`, `"reason B"`. */
  field: string;
  /** What changes: `"table"`, `"list"`, `"code"` or `"marks"` (bold, italic, code or an escape). */
  changes: string[];
  /** The start of the text on one line. */
  snippet: string;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * What would render differently from plain text, or `[]` when nothing would. Plain text shows its words and
 * its line breaks only, so the text is "the same" when the rendered words, read in order, are the words typed.
 */
export function changesFor(text: string, mode: "blocks" | "inline"): string[] {
  const { blocks } = parseRichText(text, { blocks: mode === "inline" ? "inline" : "all" });
  if (toPlainText(blocks) === squash(text)) return [];
  const structure = structureOf(blocks);
  return structure.length > 0 ? structure : ["marks"];
}

const letter = (index: number) => String.fromCharCode(65 + index);

/** Every field of a question that the renderer would change: the question and explanation in full, options and reasons as inline text. */
export function scanQuestion(question: StoredQuestion): RichTextHit[] {
  const hits: RichTextHit[] = [];
  const check = (field: string, text: string | null | undefined, mode: "blocks" | "inline") => {
    if (!text) return;
    const changes = changesFor(text, mode);
    if (changes.length > 0) hits.push({ field, changes, snippet: squash(text).slice(0, 80) });
  };
  check("question", question.text, "blocks");
  check("explanation", question.explanation, "blocks");
  question.options.forEach((option, index) => check(`option ${letter(index)}`, option, "inline"));
  question.rationales?.forEach((reason, index) => check(`reason ${letter(index)}`, reason, "inline"));
  return hits;
}
