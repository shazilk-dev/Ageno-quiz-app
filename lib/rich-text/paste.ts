import { parseTable } from "@/lib/quiz-import/table";

// Turning what is on the clipboard into rows of cells: a table copied from Word, Google Docs, Excel, Google
// Sheets or a web page. The editor writes the rows as a Markdown table (`build.ts`). The HTML half needs
// `DOMParser`, so it only works in a browser (and in jsdom); on the server it answers "not a table".

/** A paste bigger than this is left to the browser: it would not fit in a question anyway. */
export const MAX_PASTE_CELLS = 2000;

export interface Clipboard {
  html?: string;
  text?: string;
}

const clean = (text: string) => text.replace(/[\s ]+/g, " ").trim();

/** Tab-separated text (one record per line, quoted cells may hold line breaks) as rows, or null if it is not a grid. */
export function cellsFromText(text: string): string[][] | null {
  if (!/[\t\r\n]/.test(text.replace(/[\r\n]+$/, ""))) return null;
  const table = parseTable(text, "\t");
  if (table.unterminated !== null) return null;
  const records = table.records;
  // Spreadsheets end a copied block with a line break; a row of empty cells is not data.
  while (records.length > 0 && records[records.length - 1].every((cell) => !cell.trim())) records.pop();
  return records.length > 0 ? records : null;
}

/**
 * Rows from tab-separated text, only when it clearly is a grid: two or more lines with the same number of
 * cells (two or more), and no column that is empty on every line (that would be indented code, not a table).
 */
export function tsvToCells(text: string): string[][] | null {
  if (!text.includes("\t")) return null;
  const records = cellsFromText(text);
  if (!records || records.length < 2) return null;
  const width = records[0].length;
  if (width < 2 || records.some((record) => record.length !== width)) return null;
  if (records.length * width > MAX_PASTE_CELLS) return null;
  for (let column = 0; column < width; column++) {
    if (records.every((record) => !record[column].trim())) return null;
  }
  return records.map((record) => record.map(clean));
}

const BLOCK_TAGS = new Set([
  "P", "DIV", "BR", "LI", "UL", "OL", "TR", "TD", "TH", "TABLE", "BLOCKQUOTE", "PRE", "H1", "H2", "H3", "H4", "H5", "H6",
]);
const SKIPPED_TAGS = new Set(["STYLE", "SCRIPT", "HEAD", "TEMPLATE", "NOSCRIPT"]);

/** The words in a cell: block elements and line breaks become spaces, a nested table is flattened. */
function cellText(node: Node, out: string[] = []): string {
  if (node.nodeType === 3) {
    out.push(node.textContent ?? "");
  } else if (node.nodeType === 1) {
    const tag = (node as Element).tagName.toUpperCase();
    if (SKIPPED_TAGS.has(tag)) return "";
    const block = BLOCK_TAGS.has(tag);
    if (block) out.push(" ");
    node.childNodes.forEach((child) => cellText(child, out));
    if (block) out.push(" ");
  }
  return clean(out.join(""));
}

const span = (value: number, max: number) => (Number.isFinite(value) && value > 1 ? Math.min(value, max) : 1);

/**
 * Rows from the one table in a piece of HTML. A merged cell repeats its text in every cell it covers. Null
 * when there is no table, more than one (the plain-text half of the clipboard usually has them as tabs), or
 * one with fewer than two rows or columns.
 */
export function htmlTableToCells(html: string): string[][] | null {
  if (typeof DOMParser === "undefined" || !/<table[\s>]/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table")).filter((table) => !table.parentElement?.closest("table"));
  if (tables.length !== 1) return null;

  const trs = Array.from(tables[0].rows);
  const grid: (string | undefined)[][] = trs.map(() => []);
  trs.forEach((tr, r) => {
    let c = 0;
    for (const cell of Array.from(tr.cells)) {
      while (grid[r][c] !== undefined) c++;
      const text = cellText(cell);
      const cols = span(cell.colSpan, 50);
      const rows = span(cell.rowSpan, trs.length - r);
      for (let dr = 0; dr < rows; dr++) {
        for (let dc = 0; dc < cols; dc++) grid[r + dr][c + dc] = text;
      }
      c += cols;
    }
  });

  const width = Math.max(0, ...grid.map((row) => row.length));
  const rows = grid.map((row) => Array.from({ length: width }, (_, column) => row[column] ?? ""));
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => !cell)) rows.pop();
  if (rows.length < 2 || width < 2 || rows.length * width > MAX_PASTE_CELLS) return null;
  return rows;
}

/** The table on the clipboard, if there is one: the HTML table first (it knows merged cells), then tab-separated text. */
export function tableFromClipboard(clipboard: Clipboard): string[][] | null {
  return (clipboard.html ? htmlTableToCells(clipboard.html) : null) ?? (clipboard.text ? tsvToCells(clipboard.text) : null);
}
