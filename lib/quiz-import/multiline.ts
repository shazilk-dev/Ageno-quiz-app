import { isFenceEnd, isFenceStart } from "@/lib/rich-text/parse";

// Question text and explanation that run over several lines, in the plain-text format (docs/RICH_TEXT_PLAN.md,
// R4.1). A question may now hold a scenario, a table, a list or a code block, so the reader (`text.ts`) and the
// writer (`write.ts`) share these rules and a question written out and read back is the same text.
//
// Reading, line by line:
//   - a blank line is kept: "a", blank, "b" is "a\n\nb" (two blank lines are "a\n\n\nb");
//   - a line with a `|` in it, or next to one, keeps its line break (the rows of a table);
//   - so does a line that starts like a mark (`\- item`, see below), or sits next to one (the items of a list);
//   - a code block (``` ... ```) is kept exactly, blank lines and indentation included;
//   - a line ending with `\` keeps its line break, and the backslash is dropped;
//   - any other line joins the one before it with a space, as a hand-wrapped line always did;
//   - a line that would be read as a mark (`- option`, `~ reason`, `> note`, `! image`, `# title`, `3. next`)
//     can be written with a backslash in front, and the backslash is dropped. That is how a list inside a
//     question is written in this format.

/** What the readers take for a mark when it starts a line: an option, a reason, a note, an image, a title, a question. */
const LOOKALIKE = /^(?:[-*](?:\s|$)|[~>!]|#|(?:q\s*)?\d+\s*[.):]\s)/i;

const looksLikeMark = (line: string): boolean => LOOKALIKE.test(line);

/** A break between two lines that the text format keeps without a marker. */
const keepsBreak = (before: string, after: string): boolean =>
  before.includes("|") ||
  after.includes("|") ||
  looksLikeMark(before) ||
  looksLikeMark(after) ||
  isFenceStart(before) ||
  isFenceStart(after) ||
  isFenceEnd(before);

/** Reads the lines of one field (the question or the explanation) into its text. */
export class MultilineText {
  text = "";
  private started = false;
  private blanks = 0;
  private hard = false;
  private previous = "";
  private fence: { open: boolean; line: number } = { open: false, line: 0 };

  /** Whether the next line is part of a code block, which is taken exactly as it stands. */
  get insideCode(): boolean {
    return this.fence.open;
  }

  /** The 1-based line number where a code block was opened and never closed, or 0. */
  get unclosedFence(): number {
    return this.fence.open ? this.fence.line : 0;
  }

  /** A blank line: part of the text between two paragraphs, or inside a code block. */
  blank(): void {
    if (this.fence.open) this.text += "\n";
    else this.blanks++;
  }

  /** The next line of the field (`number` is its line in the file, for the unclosed-block message). */
  push(raw: string, number: number): void {
    if (this.fence.open) {
      this.text += `\n${raw.replace(/\s+$/, "")}`;
      if (isFenceEnd(raw)) {
        this.fence.open = false;
        this.previous = "```";
      }
      return;
    }

    let line = raw.trim();
    const opens = isFenceStart(line);
    let hard = false;
    if (!opens) {
      // The first line follows the "1. " or "> " already, so it is never taken for a mark.
      if (this.started && line.startsWith("\\") && looksLikeMark(line.replace(/^\\+/, ""))) line = line.slice(1);
      if (line.endsWith("\\")) {
        hard = true;
        line = line.slice(0, -1);
      }
    }

    if (!this.started) this.text = line;
    else if (this.blanks > 0) this.text += "\n".repeat(this.blanks + 1) + line;
    else this.text += (this.hard || keepsBreak(this.previous, line) ? "\n" : " ") + line;

    this.started = true;
    this.blanks = 0;
    this.hard = hard;
    this.previous = line;
    if (opens) this.fence = { open: true, line: number };
  }
}

/**
 * The lines to write for a field's text, the first one without any indentation or mark (the caller puts
 * `1. ` or `> ` in front of it and indents the others, except those inside a code block: `inFence`).
 */
export function writeMultiline(text: string): { line: string; inFence: boolean }[] {
  const source = text.replace(/\r\n?/g, "\n").split("\n");
  const out: { line: string; inFence: boolean }[] = [];
  let fence = false;
  source.forEach((raw, index) => {
    if (fence) {
      out.push({ line: raw, inFence: true });
      if (isFenceEnd(raw)) fence = false;
      return;
    }
    const line = raw.trim();
    if (!line) {
      out.push({ line: "", inFence: false });
      return;
    }
    if (isFenceStart(line)) {
      out.push({ line, inFence: false });
      fence = true;
      return;
    }
    let written = line;
    if (index > 0 && looksLikeMark(line.replace(/^\\+/, ""))) written = `\\${written}`;
    const next = source[index + 1]?.trim();
    // A single break to a plain line needs the marker; so does a line that already ends with a backslash.
    const needsMarker = line.endsWith("\\") || (next !== undefined && next !== "" && !keepsBreak(line, next));
    out.push({ line: needsMarker ? `${written}\\` : written, inFence: false });
  });
  return out;
}
