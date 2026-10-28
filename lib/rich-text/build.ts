import type { Align } from "./types";

// Writing tables: what the editor's Insert table, the paste converter and the table editor produce. Pure.
// The parser reads these back (`parse.ts`), and the tests check that the two agree.

const isWord = (c: string | undefined) => c !== undefined && (/[A-Za-z0-9]/.test(c) || c.charCodeAt(0) >= 192);
/** Characters a backslash can escape in the syntax (see `parse.ts`). */
const ESCAPABLE = "\\*_|`";

/**
 * Plain text as it must be written inside a table cell to read back as the same text: line breaks become
 * spaces (a cell is one line), and anything the syntax would take for a mark is escaped. A lone `*`, and a `_`
 * inside a word, are left alone because they are not marks.
 */
export function escapeCell(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "\\") out += next !== undefined && ESCAPABLE.includes(next) ? "\\\\" : "\\";
    else if (c === "|" || c === "`") out += `\\${c}`;
    else if (c === "*") out += next === "*" || text[i - 1] === "*" ? "\\*" : "*";
    else if (c === "_") out += isWord(text[i - 1]) && isWord(next) ? "_" : "\\_";
    else out += c;
  }
  return out;
}

/** A cell as the table editor shows it: the source, except that `\|` is shown as the `|` it stands for. */
export function editableCell(source: string): string {
  let out = "";
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\" && i + 1 < source.length) {
      out += source[i + 1] === "|" ? "|" : source[i] + source[i + 1];
      i++;
    } else {
      out += source[i];
    }
  }
  return out;
}

/** The reverse of `editableCell`: a line, with each bare `|` written as `\|`. Other escapes stay as typed. */
export function storableCell(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  let out = "";
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] === "\\" && i + 1 < flat.length) {
      out += flat[i] + flat[i + 1];
      i++;
    } else {
      out += flat[i] === "|" ? "\\|" : flat[i];
    }
  }
  return out;
}

const DELIMITER: Record<string, string> = { left: ":---", center: ":---:", right: "---:", none: "---" };

/**
 * A Markdown table from rows of cell source (the first row is the header). `align` has one entry per column;
 * a missing entry means no alignment. Rows are padded to the widest one so every row has the same number of cells.
 */
export function tableToMarkdown(rows: readonly (readonly string[])[], align: readonly Align[] = []): string {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const line = (cells: readonly string[]) =>
    `| ${Array.from({ length: width }, (_, column) => cells[column] ?? "").join(" | ")} |`;
  const delimiter = `|${Array.from({ length: width }, (_, column) => ` ${DELIMITER[align[column] ?? "none"]} `).join("|")}|`;
  const [header = [], ...body] = rows;
  return [line(header), delimiter, ...body.map(line)].join("\n");
}

/** A blank table to start from: `columns` columns, a header row and `bodyRows` empty rows. */
export function blankTable(columns: number, bodyRows: number): string[][] {
  return [
    Array.from({ length: columns }, (_, column) => `Column ${column + 1}`),
    ...Array.from({ length: bodyRows }, () => Array.from({ length: columns }, () => "")),
  ];
}
