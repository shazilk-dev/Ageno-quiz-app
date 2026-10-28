import { scanBlocks } from "./parse";
import type { Align } from "./types";

// Finding the table under the cursor, for "Edit table", and putting an edited one back. Uses the parser's
// own block scan, so a line is a table here exactly when it is one on the player's screen. Offsets are into
// the text as the textarea holds it (line breaks are `\n`).

export interface TableSpan {
  /** Offset of the first character of the header row. */
  from: number;
  /** Offset just after the last character of the last row. */
  to: number;
  align: Align[];
  /** Header row first. Cell source as written (`**bold**`, `\|`); every row as wide as the widest. */
  cells: string[][];
}

export function findTableAt(text: string, cursor: number): TableSpan | null {
  if (!text.includes("|")) return null;
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  for (const block of scanBlocks(lines)) {
    if (block.kind !== "table") continue;
    const from = starts[block.from];
    const to = starts[block.to - 1] + lines[block.to - 1].length;
    if (cursor < from || cursor > to) continue;
    const rows = [block.header, ...block.rows];
    const width = Math.max(...rows.map((row) => row.length));
    return {
      from,
      to,
      align: Array.from({ length: width }, (_, column) => block.align[column] ?? null),
      cells: rows.map((row) => Array.from({ length: width }, (_, column) => row[column] ?? "")),
    };
  }
  return null;
}
