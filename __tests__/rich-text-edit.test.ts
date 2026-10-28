// The pure side of the editor's rich-text tools (docs/RICH_TEXT_PLAN.md, R3): writing tables, the toolbar's
// edits, finding the table under the cursor, and the checks that say a table is broken or too big.
//   npx vitest run __tests__/rich-text-edit.test.ts
import { describe, expect, it } from "vitest";
import { checkQuiz, LONG_TABLE_ROWS, WIDE_TABLE_COLUMNS, type LevelForChecks } from "@/lib/quiz-checks";
import type { EditorQuestion, Level } from "@/lib/quiz-schema";
import { blankTable, editableCell, escapeCell, storableCell, tableToMarkdown } from "@/lib/rich-text/build";
import { applyEdit, insertBlock, insertCodeBlock, toggleBold, toggleList } from "@/lib/rich-text/edit";
import { parseRichText } from "@/lib/rich-text/parse";
import { toPlainText } from "@/lib/rich-text/plain";
import { findTableAt } from "@/lib/rich-text/table-at";
import type { Block } from "@/lib/rich-text/types";

const tableOf = (text: string) => parseRichText(text).blocks.find((b): b is Extract<Block, { type: "table" }> => b.type === "table");

describe("tableToMarkdown", () => {
  it("writes a header, a delimiter row with the alignment, and the rows", () => {
    expect(
      tableToMarkdown(
        [
          ["Region", "Q1", "Notes"],
          ["North", "120", "ok"],
        ],
        ["left", "right", null]
      )
    ).toBe("| Region | Q1 | Notes |\n| :--- | ---: | --- |\n| North | 120 | ok |");
  });

  it("pads short rows so every row has the same number of cells", () => {
    const table = tableOf(tableToMarkdown([["A", "B", "C"], ["1"], ["1", "2", "3", "4"]]));
    expect(table?.header).toHaveLength(4);
    expect(table?.rows.every((row) => row.length === 4)).toBe(true);
  });

  it("is read back by the parser with the same cells and alignment", () => {
    const rows = [["Name", "Score"], ["Ann", "9"], ["Bo", "7"]];
    const table = tableOf(tableToMarkdown(rows, ["center", "right"]));
    expect(table?.align).toEqual(["center", "right"]);
    expect(table?.header.map((cell) => toPlainText([{ type: "paragraph", children: cell }]))).toEqual(["Name", "Score"]);
    expect(table?.rows).toHaveLength(2);
  });

  it("writes a header-less table as an empty header row the parser still reads as a table", () => {
    const text = tableToMarkdown([["", ""], ["a", "b"]]);
    expect(tableOf(text)?.rows).toHaveLength(1);
  });

  it("writes a one-column table", () => {
    expect(tableOf(tableToMarkdown([["Only"], ["x"], ["y"]]))?.rows).toHaveLength(2);
  });

  it("makes a blank table of the size asked for", () => {
    const rows = blankTable(3, 2);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(["Column 1", "Column 2", "Column 3"]);
    expect(rows[2]).toEqual(["", "", ""]);
  });
});

describe("escapeCell", () => {
  // Whatever text goes into a cell has to come out of the parser as the same words.
  const samples = [
    "a|b",
    "2**3",
    "**bold**",
    "_italic_",
    "snake_case_name",
    "a_b_",
    "`code`",
    "C:\\|x",
    "trailing\\",
    "\\*",
    "5 * 3",
    "<b>hi</b>",
    "plain words",
    "a\nb",
    "  spaced   out  ",
  ];
  for (const sample of samples) {
    it(`round-trips ${JSON.stringify(sample)}`, () => {
      const table = tableOf(tableToMarkdown([["H"], [escapeCell(sample)]]));
      const cell = table?.rows[0][0] ?? [];
      expect(toPlainText([{ type: "paragraph", children: cell }])).toBe(sample.replace(/\s+/g, " ").trim());
      // and it is not bold or italic by accident
      expect(cell.every((node) => node.type === "text")).toBe(true);
    });
  }

  it("leaves ordinary text alone", () => {
    expect(escapeCell("North 120 (+5%)")).toBe("North 120 (+5%)");
  });
});

describe("editableCell and storableCell", () => {
  it("show an escaped pipe as a pipe and write it back", () => {
    expect(editableCell("a \\| b")).toBe("a | b");
    expect(storableCell("a | b")).toBe("a \\| b");
  });

  it("keep other escapes and marks as typed", () => {
    expect(editableCell("**x** \\* \\\\")).toBe("**x** \\* \\\\");
    expect(storableCell("**x** \\* \\\\")).toBe("**x** \\* \\\\");
  });

  it("round-trip through each other", () => {
    for (const source of ["a \\| b", "x\\\\\\|y", "plain", ""]) {
      expect(storableCell(editableCell(source))).toBe(source);
    }
  });

  it("turn a typed line break into a space", () => {
    expect(storableCell("a\nb")).toBe("a b");
  });
});

describe("the toolbar edits", () => {
  const run = (text: string, from: number, to: number, edit: ReturnType<typeof toggleBold>) => {
    const next = applyEdit(text, edit);
    return { next, selected: next.slice(edit.selectFrom, edit.selectTo) };
  };

  it("bold puts the cursor between the marks when nothing is selected", () => {
    const edit = toggleBold("ab", 1, 1);
    expect(applyEdit("ab", edit)).toBe("a****b");
    expect(edit.selectFrom).toBe(3);
    expect(edit.selectTo).toBe(3);
  });

  it("bold wraps the selection and keeps it selected", () => {
    const { next, selected } = run("say hello now", 4, 9, toggleBold("say hello now", 4, 9));
    expect(next).toBe("say **hello** now");
    expect(selected).toBe("hello");
  });

  it("bold leaves spaces at the edges of the selection outside the marks", () => {
    expect(applyEdit("a hello b", toggleBold("a hello b", 1, 8))).toBe("a **hello** b");
  });

  it("bold removes marks that are inside the selection", () => {
    expect(applyEdit("a **hello** b", toggleBold("a **hello** b", 2, 11))).toBe("a hello b");
  });

  it("bold removes marks just outside the selection", () => {
    const text = "a **hello** b";
    const { next, selected } = run(text, 4, 9, toggleBold(text, 4, 9));
    expect(next).toBe("a hello b");
    expect(selected).toBe("hello");
  });

  it("the list button prefixes each non-empty line, and removes the prefixes the second time", () => {
    const text = "intro\napples\npears\n\noutro";
    const from = text.indexOf("apples");
    const to = text.indexOf("pears") + 5;
    const once = applyEdit(text, toggleList(text, from, to));
    expect(once).toBe("intro\n- apples\n- pears\n\noutro");
    const again = applyEdit(once, toggleList(once, once.indexOf("- apples"), once.indexOf("pears") + 5));
    expect(again).toBe(text);
  });

  it("the list button works on the first line of the text and on one line with the cursor", () => {
    expect(applyEdit("apples", toggleList("apples", 0, 0))).toBe("- apples");
    expect(applyEdit("a\nb", toggleList("a\nb", 2, 2))).toBe("a\n- b");
  });

  it("the list button writes two example items on an empty line, the first selected", () => {
    const edit = toggleList("Intro\n\n", 7, 7);
    const next = applyEdit("Intro\n\n", edit);
    expect(next).toBe("Intro\n\n- First item\n- Second item");
    expect(next.slice(edit.selectFrom, edit.selectTo)).toBe("First item");
    expect(parseRichText(next).blocks.some((b) => b.type === "list")).toBe(true);
  });

  it("a block goes in its own paragraph, whatever is around it", () => {
    expect(applyEdit("before after", insertBlock("before after", 6, 6, "BLOCK"))).toBe("before\n\nBLOCK\n\nafter");
    expect(applyEdit("before\n", insertBlock("before\n", 7, 7, "BLOCK"))).toBe("before\n\nBLOCK\n\n");
    expect(applyEdit("before\n\nafter", insertBlock("before\n\nafter", 8, 8, "BLOCK"))).toBe("before\n\nBLOCK\n\nafter");
    expect(applyEdit("", insertBlock("", 0, 0, "BLOCK"))).toBe("BLOCK\n\n");
  });

  it("a block replaces the selection and leaves the cursor below it", () => {
    const text = "Q: junk";
    const edit = insertBlock(text, 2, 7, "BLOCK");
    const next = applyEdit(text, edit);
    expect(next).toBe("Q:\n\nBLOCK\n\n");
    expect(edit.selectFrom).toBe(next.length);
  });

  it("the code button fences the selection and selects the code", () => {
    const text = "Run this x = 1";
    const edit = insertCodeBlock(text, 9, 14);
    const next = applyEdit(text, edit);
    expect(next).toBe("Run this\n\n```\nx = 1\n```\n\n");
    expect(next.slice(edit.selectFrom, edit.selectTo)).toBe("x = 1");
    expect(parseRichText(next).blocks.map((b) => b.type)).toEqual(["paragraph", "code"]);
  });

  it("the code button with no selection leaves the cursor inside the fence", () => {
    const edit = insertCodeBlock("", 0, 0);
    expect(applyEdit("", edit)).toBe("```\n\n```\n\n");
    expect(edit.selectFrom).toBe(4);
    expect(edit.selectTo).toBe(4);
  });
});

describe("findTableAt", () => {
  const text = "Intro line\n\n| A | B |\n|:--|--:|\n| 1 | 2 |\n| 3 |\n\nOutro";

  it("finds the table when the cursor is anywhere in it, edges included", () => {
    const start = text.indexOf("| A");
    const end = text.indexOf("\n\nOutro");
    for (const cursor of [start, start + 3, text.indexOf("|:--") + 2, end]) {
      const span = findTableAt(text, cursor);
      expect(span, `cursor ${cursor}`).not.toBeNull();
      expect(text.slice(span!.from, span!.to)).toBe("| A | B |\n|:--|--:|\n| 1 | 2 |\n| 3 |");
    }
  });

  it("gives the cells as written, every row as wide as the table, and the alignment", () => {
    const span = findTableAt(text, text.indexOf("| 1"))!;
    expect(span.cells).toEqual([["A", "B"], ["1", "2"], ["3", ""]]);
    expect(span.align).toEqual(["left", "right"]);
  });

  it("keeps the extra cells of a row that is too long", () => {
    const span = findTableAt("| A |\n|---|\n| 1 | 2 |", 3)!;
    expect(span.cells).toEqual([["A", ""], ["1", "2"]]);
  });

  it("finds nothing outside the table, or in text that only looks like one", () => {
    expect(findTableAt(text, 3)).toBeNull();
    expect(findTableAt(text, text.length)).toBeNull();
    expect(findTableAt("| a | b |\n| 1 | 2 |", 3)).toBeNull();
    expect(findTableAt("no pipes here", 3)).toBeNull();
  });

  it("does not see a table inside a code block", () => {
    const fenced = "```\n| A | B |\n|---|---|\n| 1 | 2 |\n```";
    expect(findTableAt(fenced, fenced.indexOf("| 1"))).toBeNull();
  });

  it("finds the right one of two tables, and writing one back leaves the other alone", () => {
    const two = "| A |\n|---|\n| 1 |\n\nmiddle\n\n| B |\n|---|\n| 2 |";
    const span = findTableAt(two, two.indexOf("| 2"))!;
    expect(span.cells[0]).toEqual(["B"]);
    const markdown = tableToMarkdown([["B"], ["two"]]);
    const next = applyEdit(two, { from: span.from, to: span.to, insert: markdown, selectFrom: 0, selectTo: 0 });
    expect(next).toBe(`| A |\n|---|\n| 1 |\n\nmiddle\n\n${markdown}`);
  });

  it("works on text with Windows line ends", () => {
    const crlf = "Intro\r\n\r\n| A |\r\n|---|\r\n| 1 |\r\n";
    const span = findTableAt(crlf, crlf.indexOf("| 1"))!;
    expect(span.cells).toEqual([["A"], ["1"]]);
  });
});

describe("the checks for rich text", () => {
  const q = (text: string, extra: Partial<EditorQuestion> = {}): EditorQuestion => ({
    type: "single",
    text,
    options: [
      { text: "Yes", isCorrect: true },
      { text: "No", isCorrect: false },
    ],
    explanation: "Because.",
    ...extra,
  });
  const levels = (questions: EditorQuestion[]): Record<Level, LevelForChecks> => ({
    easy: { duration: 30, questions },
    medium: { duration: 30, questions: [] },
    hard: { duration: 30, questions: [] },
  });
  const messages = (questions: EditorQuestion[]) => checkQuiz(levels(questions)).filter((c) => /formatting|table/.test(c.code));

  it("says nothing about plain text or a good table", () => {
    expect(messages([q("Plain?"), q("Scenario:\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nWhich?")])).toEqual([]);
  });

  it("says a row has the wrong number of cells, and where", () => {
    const [check] = messages([q("Scenario\n\n| A | B |\n|---|---|\n| 1 | 2 | 3 |\n\nWhich?")]);
    expect(check.code).toBe("formatting");
    expect(check.questions).toEqual([0]);
    expect(check.message).toMatch(/^Question text, line 5: Row 2 has 3 cells but the header has 2/);
  });

  it("says a table has no delimiter row", () => {
    const [check] = messages([q("| A | B |\n| 1 | 2 |")]);
    expect(check.message).toMatch(/no \|---\| line/);
  });

  it("says HTML is shown as text, in the question, the explanation and an option", () => {
    const found = messages([
      q("Line one<br>line two", { explanation: "See <b>this</b>", options: [{ text: "<i>Yes</i>", isCorrect: true }, { text: "No", isCorrect: false }] }),
    ]);
    expect(found.map((c) => c.message.split(":")[0])).toEqual(["Question text", "Explanation", "Option A"]);
  });

  it("counts the other problems in the same text instead of listing them all", () => {
    const rows = Array.from({ length: 3 }, () => "| 1 | 2 | 3 |").join("\n");
    const [check] = messages([q(`| A | B |\n|---|---|\n${rows}`)]);
    expect(check.message).toMatch(/\(2 more problems in this text\.\)$/);
  });

  it("warns about an unclosed code block", () => {
    expect(messages([q("```\nx = 1")])[0].message).toMatch(/never ends/);
  });

  it("warns about a table with more than six columns, or more than 25 rows", () => {
    const wide = tableToMarkdown([Array.from({ length: WIDE_TABLE_COLUMNS + 1 }, (_, i) => `C${i}`), Array.from({ length: WIDE_TABLE_COLUMNS + 1 }, () => "x")]);
    const long = tableToMarkdown([["A"], ...Array.from({ length: LONG_TABLE_ROWS + 1 }, () => ["x"])]);
    expect(messages([q(wide)]).map((c) => c.code)).toEqual(["wide-table"]);
    expect(messages([q(long)]).map((c) => c.code)).toEqual(["long-table"]);
    const edge = tableToMarkdown([Array.from({ length: WIDE_TABLE_COLUMNS }, (_, i) => `C${i}`), ...Array.from({ length: LONG_TABLE_ROWS }, () => Array.from({ length: WIDE_TABLE_COLUMNS }, () => "x"))]);
    expect(messages([q(edge)])).toEqual([]);
  });

  it("points at the question it is about", () => {
    const checks = messages([q("Fine?"), q("Broken<br>text")]);
    expect(checks).toHaveLength(1);
    expect(checks[0].questions).toEqual([1]);
  });
});
