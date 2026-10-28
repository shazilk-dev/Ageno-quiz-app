import type { Align, Block, Diagnostic, Inline, ParseOptions, ParseResult } from "./types";

// A hand-written parser for the Markdown subset described in docs/RICH_TEXT_PLAN.md. Pure and
// dependency-free: the renderer, the editor checks, the importers and the generated validate.mjs all use it.
// It never throws and never changes what it was given: a construct it does not recognise stays text.

const FENCE = /^\s*```[^`]*$/;
const FENCE_END = /^\s*```\s*$/;
const BULLET = /^[-*+]\s+(\S.*)$/;
const ORDERED = /^(\d{1,9})[.)]\s+(\S.*)$/;
const DELIMITER_CELL = /^:?-+:?$/;
/** A line that looks like a table row (`| a | b |`) but is not part of a recognised table. */
const ROW_LIKE = /^\|.*[^|\s].*\|$/;
const HTML_TAG =
  /<\/?(?:br|p|b|i|u|s|em|strong|span|div|table|thead|tbody|tr|td|th|ul|ol|li|img|a|script|style|iframe|pre|code|sub|sup|hr|font|h[1-6])(?:\s+[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))*\s*\/?>/i;
const ESCAPABLE = "\\*_|`";
const MAX_DEPTH = 6;

/** A line that opens a code block (three backticks and no other backtick on the line). */
export const isFenceStart = (line: string): boolean => FENCE.test(line);
/** A line that closes one. */
export const isFenceEnd = (line: string): boolean => FENCE_END.test(line);

/** `a|b` cells of a table row, honouring `\|`. Leading and trailing pipes are optional. */
function splitRow(line: string): string[] {
  const text = line.trim();
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length) {
      cell += c + text[i + 1];
      i++;
    } else if (c === "|") {
      cells.push(cell);
      cell = "";
    } else {
      cell += c;
    }
  }
  cells.push(cell);
  if (text.startsWith("|") && cells[0].trim() === "") cells.shift();
  if (text.endsWith("|") && cells.length > 0 && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

function hasPipe(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "|") return true;
  }
  return false;
}

function parseDelimiter(line: string): Align[] | null {
  const cells = splitRow(line);
  if (cells.length === 0 || !cells.every((cell) => DELIMITER_CELL.test(cell))) return null;
  return cells.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    return left && right ? "center" : left ? "left" : right ? "right" : null;
  });
}

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);
/** Letters and digits, any script (so `a_b_c` and `snake_case` are not italic). */
const isWord = (c: string | undefined) => c !== undefined && (/[A-Za-z0-9]/.test(c) || c.charCodeAt(0) >= 192);

/** Index of the next run of exactly `n` backticks at or after `from`, or -1. */
function findBackticks(s: string, from: number, n: number): number {
  let i = from;
  while (i < s.length) {
    if (s[i] !== "`") {
      i++;
      continue;
    }
    let run = 0;
    while (s[i + run] === "`") run++;
    if (run === n) return i;
    i += run;
  }
  return -1;
}

/**
 * Index of the mark that closes an opener whose content starts at `start`, or -1. Skips escapes and code
 * spans. `**` closes after a non-space; `_` closes after a non-space and before a non-word character.
 */
function findClose(s: string, start: number, mark: "**" | "_"): number {
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && ESCAPABLE.includes(s[i + 1])) {
      i += 2;
    } else if (c === "`") {
      let n = 1;
      while (s[i + n] === "`") n++;
      const close = findBackticks(s, i + n, n);
      i = close >= 0 ? close + n : i + n;
    } else if (i > start && !isSpace(s[i - 1])) {
      if (mark === "**" && c === "*" && s[i + 1] === "*") return i;
      if (mark === "_" && c === "_" && !isWord(s[i + 1]) && s[i + 1] !== "_") return i;
      i++;
    } else {
      i++;
    }
  }
  return -1;
}

/** Bold, italic, code, escapes and (in text with newlines) line breaks. `inTable`: `\|` inside code is a pipe. */
function parseInline(s: string, inTable: boolean, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", text: buf });
    buf = "";
  };
  // Once a mark has no closer after some position, no later opener can find one either.
  let boldOpen = depth < MAX_DEPTH;
  let italicOpen = depth < MAX_DEPTH;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\n") {
      flush();
      out.push({ type: "break" });
      i++;
    } else if (c === "\\" && i + 1 < s.length && ESCAPABLE.includes(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
    } else if (c === "`") {
      let n = 1;
      while (s[i + n] === "`") n++;
      const close = findBackticks(s, i + n, n);
      if (close < 0) {
        buf += "`".repeat(n);
        i += n;
      } else {
        flush();
        let code = s.slice(i + n, close).replace(/\n/g, " ");
        if (inTable) code = code.replace(/\\\|/g, "|");
        out.push({ type: "code", text: code });
        i = close + n;
      }
    } else if (c === "*" && s[i + 1] === "*") {
      const opens = boldOpen && s[i + 2] !== undefined && !isSpace(s[i + 2]);
      const close = opens ? findClose(s, i + 2, "**") : -1;
      if (close < 0) {
        if (opens) boldOpen = false;
        buf += "**";
        i += 2;
      } else {
        flush();
        out.push({ type: "bold", children: parseInline(s.slice(i + 2, close), inTable, depth + 1) });
        i = close + 2;
      }
    } else if (c === "_") {
      const before = s[i - 1];
      const after = s[i + 1];
      const opens =
        italicOpen &&
        !isWord(before) &&
        before !== "_" &&
        after !== undefined &&
        !isSpace(after) &&
        after !== "_";
      const close = opens ? findClose(s, i + 1, "_") : -1;
      if (close < 0) {
        if (opens) italicOpen = false;
        buf += c;
        i++;
      } else {
        flush();
        out.push({ type: "italic", children: parseInline(s.slice(i + 1, close), inTable, depth + 1) });
        i = close + 1;
      }
    } else {
      buf += c;
      i++;
    }
  }
  flush();
  return out;
}

interface TableMatch {
  end: number;
  align: Align[];
  header: string[];
  rows: string[][];
}

/** A table starts at `i` only when the next line is a delimiter row with the same number of cells. */
function tableAt(lines: string[], i: number): TableMatch | null {
  const head = lines[i];
  const delimiter = lines[i + 1];
  if (delimiter === undefined || !hasPipe(head) || !hasPipe(delimiter)) return null;
  const align = parseDelimiter(delimiter);
  if (!align) return null;
  const header = splitRow(head);
  if (header.length !== align.length) return null;
  const rows: string[][] = [];
  let j = i + 2;
  while (j < lines.length && lines[j].trim() !== "" && hasPipe(lines[j]) && !FENCE.test(lines[j])) {
    rows.push(splitRow(lines[j]));
    j++;
  }
  return { end: j, align, header, rows };
}

interface ListMatch {
  end: number;
  ordered: boolean;
  start: number;
  items: string[];
}

/** Two or more consecutive items of the same kind: a lone `- x` line stays text. */
function listAt(lines: string[], i: number): ListMatch | null {
  const kind = (line: string) => {
    const text = line.trim();
    const bullet = BULLET.exec(text);
    if (bullet) return { ordered: false, number: 1, content: bullet[1] };
    const ordered = ORDERED.exec(text);
    return ordered ? { ordered: true, number: Number(ordered[1]), content: ordered[2] } : null;
  };
  const first = kind(lines[i]);
  if (!first) return null;
  const items = [first.content];
  let j = i + 1;
  for (let next = kind(lines[j] ?? ""); next && next.ordered === first.ordered; next = kind(lines[j] ?? "")) {
    items.push(next.content);
    j++;
  }
  return items.length < 2 ? null : { end: j, ordered: first.ordered, start: first.number, items };
}

/** Text of a line with its code spans taken out, for the HTML check. */
function withoutCode(line: string): string {
  return line.replace(/(`+)[^`]*?\1/g, "");
}

function htmlDiagnostics(lines: string[], skip: boolean[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  lines.forEach((line, index) => {
    if (skip[index]) return;
    const match = HTML_TAG.exec(withoutCode(line));
    if (!match) return;
    const tag = match[0];
    out.push({
      kind: "html-tag",
      line: index + 1,
      message: /^<br\b/i.test(tag)
        ? `${tag} is shown as text. Start a new line instead (leave an empty line between paragraphs).`
        : `HTML such as ${tag} is shown as text. Use the formatting shown in the help instead.`,
    });
  });
  return out;
}

/** The text as typed, with only its line breaks kept: what the parser falls back to. */
function plainBlocks(text: string): Block[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const children: Inline[] = [];
  trimmed.split("\n").forEach((line, index) => {
    if (index > 0) children.push({ type: "break" });
    if (line) children.push({ type: "text", text: line });
  });
  return [{ type: "paragraph", children }];
}

/** A run of lines the parser recognised, before it becomes a `Block`. `to` is exclusive. */
export type RawBlock =
  | { kind: "fence"; from: number; to: number; code: string[]; closed: boolean }
  | { kind: "table"; from: number; to: number; align: Align[]; header: string[]; rows: string[][] }
  | { kind: "list"; from: number; to: number; ordered: boolean; start: number; items: string[] }
  | { kind: "paragraph"; from: number; to: number; lines: string[] };

/** The one place that decides where a table, list, code block or paragraph starts and ends (0-based lines). */
export function scanBlocks(lines: string[]): RawBlock[] {
  const out: RawBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    if (FENCE.test(line)) {
      const code: string[] = [];
      let j = i + 1;
      while (j < lines.length && !FENCE_END.test(lines[j])) {
        code.push(lines[j]);
        j++;
      }
      const closed = j < lines.length;
      out.push({ kind: "fence", from: i, to: closed ? j + 1 : j, code, closed });
      i = j + 1;
      continue;
    }

    const table = tableAt(lines, i);
    if (table) {
      out.push({ kind: "table", from: i, to: table.end, align: table.align, header: table.header, rows: table.rows });
      i = table.end;
      continue;
    }

    const list = listAt(lines, i);
    if (list) {
      out.push({ kind: "list", from: i, to: list.end, ordered: list.ordered, start: list.start, items: list.items });
      i = list.end;
      continue;
    }

    const start = i;
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      if (i > start && (FENCE.test(lines[i]) || tableAt(lines, i) || listAt(lines, i))) break;
      paragraph.push(lines[i].trim());
      i++;
    }
    out.push({ kind: "paragraph", from: start, to: i, lines: paragraph });
  }
  return out;
}

function parseAll(text: string, options: ParseOptions): ParseResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const diagnostics: Diagnostic[] = [];
  const blocks: Block[] = [];
  const inFence: boolean[] = [];

  if (options.blocks === "inline") {
    const body = lines.map((line) => line.trim()).join("\n").trim();
    if (body) blocks.push({ type: "paragraph", children: parseInline(body, false) });
    return { blocks, diagnostics: htmlDiagnostics(lines, inFence) };
  }

  for (const raw of scanBlocks(lines)) {
    switch (raw.kind) {
      case "fence": {
        for (let j = raw.from; j < raw.to; j++) inFence[j] = true;
        if (!raw.closed) {
          diagnostics.push({
            kind: "unclosed-fence",
            line: raw.from + 1,
            message: "The code block starts with ``` but never ends. Close it with a line of ```.",
          });
        }
        blocks.push({ type: "code", text: raw.code.join("\n") });
        break;
      }
      case "table": {
        const columns = raw.header.length;
        raw.rows.forEach((row, index) => {
          if (row.length !== columns) {
            diagnostics.push({
              kind: "table-columns",
              line: raw.from + 3 + index,
              message: `Row ${index + 2} has ${row.length} cells but the header has ${columns}.${
                row.length > columns ? " The extra cells are not shown." : " The missing cells are left empty."
              }`,
            });
          }
        });
        const cell = (text: string | undefined) => parseInline(text ?? "", true);
        blocks.push({
          type: "table",
          align: raw.align,
          header: raw.header.map(cell),
          rows: raw.rows.map((row) => raw.header.map((_, column) => cell(row[column]))),
        });
        break;
      }
      case "list":
        blocks.push({
          type: "list",
          ordered: raw.ordered,
          start: raw.start,
          items: raw.items.map((item) => parseInline(item, false)),
        });
        break;
      case "paragraph": {
        const rowLike = raw.lines.findIndex((row) => ROW_LIKE.test(row));
        if (rowLike >= 0) {
          diagnostics.push({
            kind: "table-no-header",
            line: raw.from + rowLike + 1,
            message:
              "This looks like a table but has no |---| line under its first row (with the same number of cells), so it is shown as text.",
          });
        }
        blocks.push({ type: "paragraph", children: parseInline(raw.lines.join("\n"), false) });
        break;
      }
    }
  }

  diagnostics.push(...htmlDiagnostics(lines, inFence));
  diagnostics.sort((a, b) => a.line - b.line);
  return { blocks, diagnostics };
}

/**
 * Text to a tree plus advice. `blocks: "inline"` (option text, reasons) allows only bold, italic, code and
 * line breaks. Every input gives a tree: a failure inside the parser falls back to the text as typed.
 */
export function parseRichText(text: string, options: ParseOptions = {}): ParseResult {
  const source = typeof text === "string" ? text : "";
  try {
    return parseAll(source, options);
  } catch {
    return { blocks: plainBlocks(source), diagnostics: [] };
  }
}
