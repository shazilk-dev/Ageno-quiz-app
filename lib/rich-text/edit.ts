// The editor's formatting buttons as pure functions: each takes the text and the selection and answers with
// the one change to make, so the field can hand it to the browser (which keeps Undo working) or apply it
// itself. Offsets are into the text as the textarea holds it.

export interface TextEdit {
  /** The range of the current text to replace. */
  from: number;
  to: number;
  insert: string;
  /** Where the selection goes, as offsets into the new text. */
  selectFrom: number;
  selectTo: number;
}

export const applyEdit = (text: string, edit: TextEdit): string =>
  text.slice(0, edit.from) + edit.insert + text.slice(edit.to);

const BULLET = /^[-*+]\s+\S/;

/**
 * Puts `block` in its own paragraph at the selection, with a blank line before and after, whatever is next
 * to it. The selection, if any, is replaced. The cursor ends after the block, on the line below.
 */
export function insertBlock(text: string, selectionFrom: number, selectionTo: number, block: string): TextEdit {
  // Spaces next to the cut would be left dangling at the end of one paragraph and the start of the next.
  let from = selectionFrom;
  while (from > 0 && (text[from - 1] === " " || text[from - 1] === "\t")) from--;
  let to = selectionTo;
  while (to < text.length && (text[to] === " " || text[to] === "\t")) to++;

  const left = text.slice(0, from);
  const right = text.slice(to);
  const before = left.trim() === "" ? "" : left.endsWith("\n\n") ? "" : left.endsWith("\n") ? "\n" : "\n\n";
  const after = right.startsWith("\n\n") ? "" : right.startsWith("\n") ? "\n" : "\n\n";
  const insert = before + block + after;
  const cursor = from + insert.length;
  return { from, to, insert, selectFrom: cursor, selectTo: cursor };
}

/**
 * `**` around the selection, or around nothing (cursor between the marks). A selection that is already bold,
 * with the marks inside or just outside it, loses them. Spaces at the edges of a selection stay outside the
 * marks, because `** x**` is not bold.
 */
export function toggleBold(text: string, from: number, to: number): TextEdit {
  const selected = text.slice(from, to);
  const lead = selected.length - selected.trimStart().length;
  const trail = selected.length - selected.trimEnd().length;
  const a = from + lead;
  const b = Math.max(a, to - trail);
  const inner = text.slice(a, b);

  if (inner.length >= 4 && inner.startsWith("**") && inner.endsWith("**")) {
    const bare = inner.slice(2, -2);
    return { from: a, to: b, insert: bare, selectFrom: a, selectTo: a + bare.length };
  }
  if (inner && text.slice(a - 2, a) === "**" && text.slice(b, b + 2) === "**") {
    return { from: a - 2, to: b + 2, insert: inner, selectFrom: a - 2, selectTo: a - 2 + inner.length };
  }
  return {
    from: a,
    to: b,
    insert: `**${inner}**`,
    selectFrom: a + 2,
    selectTo: a + 2 + inner.length,
  };
}

/**
 * Makes the lines under the selection a bulleted list, or takes the bullets off when they all have one. On an
 * empty line it writes two example items, the first selected. (A list needs two items to be one.)
 */
export function toggleList(text: string, from: number, to: number): TextEdit {
  const lineStart = from === 0 ? 0 : text.lastIndexOf("\n", from - 1) + 1;
  const endBreak = text.indexOf("\n", to > from ? to - 1 : to);
  const lineEnd = endBreak === -1 ? text.length : endBreak;
  const block = text.slice(lineStart, lineEnd);

  if (block.trim() === "") {
    const insert = "- First item\n- Second item";
    const start = lineStart + 2;
    return { from: lineStart, to: lineEnd, insert, selectFrom: start, selectTo: start + "First item".length };
  }

  const lines = block.split("\n");
  const filled = lines.filter((line) => line.trim() !== "");
  const allBullets = filled.every((line) => BULLET.test(line.trim()));
  const insert = lines
    .map((line) => {
      if (line.trim() === "") return line;
      return allBullets ? line.replace(/^(\s*)[-*+]\s+/, "$1") : `- ${line.trim()}`;
    })
    .join("\n");
  return { from: lineStart, to: lineEnd, insert, selectFrom: lineStart, selectTo: lineStart + insert.length };
}

/** A fenced code block holding the selection (or nothing, cursor inside), in its own paragraph. */
export function insertCodeBlock(text: string, from: number, to: number): TextEdit {
  const code = text.slice(from, to).replace(/^\n+|\n+$/g, "");
  const edit = insertBlock(text, from, to, `\`\`\`\n${code}\n\`\`\``);
  // Inside the fence: after the opening line, at the end of the code.
  const fenceStart = edit.from + edit.insert.indexOf("```") + 4;
  return { ...edit, selectFrom: fenceStart, selectTo: fenceStart + code.length };
}
