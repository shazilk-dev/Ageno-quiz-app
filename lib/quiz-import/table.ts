// Splits pasted spreadsheet cells or a CSV file into records of cells. No spreadsheet library: cells copied
// from Excel or Google Sheets arrive as tab-separated text, and a CSV is quoted text, so a small reader
// does both and there is no file parser to attack.
//
// Handles: a byte order mark, CRLF / LF / CR line ends, quoted cells with doubled quotes and line breaks
// inside, tab / comma / semicolon as the separator (chosen from the first line), and a quote in the middle
// of an unquoted cell (kept as it is).

export interface Table {
  /** One array of cells per record, in file order. Includes blank and comment records; the mapper skips them. */
  records: string[][];
  delimiter: "\t" | "," | ";";
  /** The 1-based record number where a quoted cell never closed, or null. */
  unterminated: number | null;
}

const DELIMITERS = ["\t", ",", ";"] as const;

/** The separator used most on the first line (outside quotes). A tab wins ties: pasted cells are tab-separated. */
export function detectDelimiter(text: string): Table["delimiter"] {
  const counts: Record<string, number> = { "\t": 0, ",": 0, ";": 0 };
  let quoted = false;
  // A quote only opens a quoted cell at the start of a cell, as in `parseTable`.
  let atStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') i++;
        else quoted = false;
      }
      continue;
    }
    if (ch === "\n" || ch === "\r") break;
    if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
      continue;
    }
    if (ch in counts) {
      counts[ch]++;
      atStart = true;
    } else {
      atStart = false;
    }
  }
  let best: Table["delimiter"] = "\t";
  for (const delimiter of DELIMITERS) if (counts[delimiter] > counts[best]) best = delimiter;
  return best;
}

export function parseTable(input: string, delimiter?: Table["delimiter"]): Table {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const sep = delimiter ?? detectDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  let quotedAt = 0;
  // Whether the current cell began with a quote, so `"a"b` can keep going after the closing quote.
  let wasQuoted = false;

  const endCell = () => {
    record.push(cell);
    cell = "";
    wasQuoted = false;
  };
  const endRecord = () => {
    endCell();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "" && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
      quotedAt = records.length + 1;
    } else if (ch === sep) {
      endCell();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRecord();
    } else if (ch === "\n") {
      endRecord();
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || record.length > 0 || wasQuoted) endRecord();

  return { records, delimiter: sep, unterminated: quoted ? quotedAt : null };
}

/** One cell as CSV text: quoted when it has to be, formula-safe (a leading = + - @ gets an apostrophe). */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe !== safe.trim() ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Undoes `csvCell`'s apostrophe, so an exported file imports back to the same text. */
export const unescapeCell = (value: string): string => (/^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value);

export function toCsvText(records: readonly (readonly string[])[]): string {
  return records.map((record) => record.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
