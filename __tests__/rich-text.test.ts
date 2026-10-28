// The Markdown subset parser (docs/RICH_TEXT_PLAN.md): one case per row of the syntax table, plus the edge
// cases. Pure, no DOM:
//   npx vitest run __tests__/rich-text.test.ts
import { describe, expect, it } from "vitest";
import { parseRichText } from "@/lib/rich-text/parse";
import { hasStructure, toPlainText } from "@/lib/rich-text/plain";
import type { Block, Inline } from "@/lib/rich-text/types";

const blocks = (text: string) => parseRichText(text).blocks;
const inline = (text: string) => parseRichText(text, { blocks: "inline" }).blocks;
const kinds = (list: Block[]) => list.map((block) => block.type);

/** What a reader sees, with the marks shown as `**bold**`, `_italic_`, `` `code` `` and breaks as `⏎`. */
function show(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "break":
          return "⏎";
        case "code":
          return `\`${node.text}\``;
        case "bold":
          return `**${show(node.children)}**`;
        case "italic":
          return `_${show(node.children)}_`;
      }
    })
    .join("");
}

function paragraph(text: string): string {
  const [first] = blocks(text);
  if (first?.type !== "paragraph") throw new Error(`not a paragraph: ${JSON.stringify(first)}`);
  return show(first.children);
}

function table(text: string) {
  const [first] = blocks(text);
  if (first?.type !== "table") throw new Error(`not a table: ${JSON.stringify(first)}`);
  return {
    align: first.align,
    header: first.header.map(show),
    rows: first.rows.map((row) => row.map(show)),
  };
}

const SALES = `A company recorded these sales figures.

| Region | Q1  | Q2  |
|:-------|----:|----:|
| North  | 120 | 150 |
| South  |  90 |  80 |

Which region grew in Q2?`;

describe("paragraphs", () => {
  it("keeps a single newline as a line break and a blank line as a new paragraph", () => {
    expect(paragraph("one\ntwo")).toBe("one⏎two");
    expect(kinds(blocks("one\n\ntwo"))).toEqual(["paragraph", "paragraph"]);
  });

  it("gives nothing for empty or blank text and never throws on odd input", () => {
    expect(blocks("")).toEqual([]);
    expect(blocks("  \n \n")).toEqual([]);
    expect(parseRichText(undefined as unknown as string).blocks).toEqual([]);
    expect(parseRichText(null as unknown as string).blocks).toEqual([]);
    expect(parseRichText(42 as unknown as string).blocks).toEqual([]);
  });

  it("reads Windows line endings like Unix ones", () => {
    expect(kinds(blocks("a\r\n\r\nb\r\nc"))).toEqual(["paragraph", "paragraph"]);
    expect(paragraph("a\r\nb")).toBe("a⏎b");
  });

  it("leaves a lone | line, or a line that merely contains a pipe, as text", () => {
    expect(paragraph("|")).toBe("|");
    expect(paragraph("a | b")).toBe("a | b");
    expect(kinds(blocks("x\n|\ny"))).toEqual(["paragraph"]);
  });
});

describe("tables", () => {
  it("reads the scenario + table + question example", () => {
    const parsed = blocks(SALES);
    expect(kinds(parsed)).toEqual(["paragraph", "table", "paragraph"]);
    expect(table("| Region | Q1 | Q2 |\n|:--|--:|--:|\n| North | 120 | 150 |")).toEqual({
      align: ["left", "right", "right"],
      header: ["Region", "Q1", "Q2"],
      rows: [["North", "120", "150"]],
    });
  });

  it("reads centre, left, right and no alignment from the delimiter row", () => {
    expect(table("|a|b|c|d|\n|:-:|:--|--:|---|\n|1|2|3|4|").align).toEqual(["center", "left", "right", null]);
  });

  it("does not need the outer pipes", () => {
    expect(table("a | b\n--|--\n1 | 2")).toEqual({ align: [null, null], header: ["a", "b"], rows: [["1", "2"]] });
  });

  it("splits cells on | but not on \\|", () => {
    expect(table("| Op | Meaning |\n|---|---|\n| a \\| b | or |").rows).toEqual([["a | b", "or"]]);
  });

  it("pads a short row and ignores the extra cells of a long one, and says so", () => {
    const result = parseRichText("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |");
    const [parsed] = result.blocks;
    if (parsed.type !== "table") throw new Error("not a table");
    expect(parsed.rows.map((row) => row.map(show))).toEqual([["1", ""], ["1", "2"]]);
    expect(result.diagnostics.map((d) => [d.kind, d.line])).toEqual([
      ["table-columns", 3],
      ["table-columns", 4],
    ]);
    expect(result.diagnostics[0].message).toBe("Row 2 has 1 cells but the header has 2. The missing cells are left empty.");
    expect(result.diagnostics[1].message).toContain("The extra cells are not shown");
  });

  it("only recognises a table when the delimiter row follows the header with the same number of cells", () => {
    const noDelimiter = parseRichText("| a | b |\n| 1 | 2 |");
    expect(kinds(noDelimiter.blocks)).toEqual(["paragraph"]);
    expect(noDelimiter.diagnostics.map((d) => d.kind)).toEqual(["table-no-header"]);

    const wrongCount = parseRichText("| a | b | c |\n|---|---|\n| 1 | 2 | 3 |");
    expect(kinds(wrongCount.blocks)).toEqual(["paragraph"]);
    expect(wrongCount.diagnostics.map((d) => d.kind)).toEqual(["table-no-header"]);
  });

  it("starts without a blank line before it and ends at the first line without a pipe", () => {
    const parsed = blocks("Look:\n| a | b |\n|---|---|\n| 1 | 2 |\nWhich is bigger?");
    expect(kinds(parsed)).toEqual(["paragraph", "table", "paragraph"]);
  });

  it("reads bold, code and italic inside cells, including a pipe in code", () => {
    expect(table("| **Name** | Code |\n|---|---|\n| _x_ | `a\\|b` |")).toEqual({
      align: [null, null],
      header: ["**Name**", "Code"],
      rows: [["_x_", "`a|b`"]],
    });
  });

  it("keeps an empty cell", () => {
    expect(table("| a | b |\n|---|---|\n|  | 2 |").rows).toEqual([["", "2"]]);
  });
});

describe("lists", () => {
  it("reads bullets with -, * and +, and numbers with . and )", () => {
    for (const mark of ["-", "*", "+"]) {
      const [list] = blocks(`${mark} one\n${mark} two`);
      expect(list).toMatchObject({ type: "list", ordered: false });
    }
    const [dot] = blocks("1. one\n2. two");
    expect(dot).toMatchObject({ type: "list", ordered: true, start: 1 });
    const [paren] = blocks("3) one\n4) two");
    expect(paren).toMatchObject({ type: "list", ordered: true, start: 3 });
  });

  it("needs two consecutive items: one lone item stays text", () => {
    expect(paragraph("- just one")).toBe("- just one");
    expect(paragraph("1. just one")).toBe("1. just one");
    expect(kinds(blocks("- a\n\n- b"))).toEqual(["paragraph", "paragraph"]);
  });

  it("ends a list where the kind changes or the items stop", () => {
    expect(kinds(blocks("- a\n- b\n1. c\n2. d\nand then"))).toEqual(["list", "list", "paragraph"]);
  });

  it("can follow a paragraph line directly", () => {
    expect(kinds(blocks("Pick:\n- a\n- b"))).toEqual(["paragraph", "list"]);
  });

  it("reads inline marks in items and ignores dashes inside a sentence", () => {
    const [list] = blocks("- **a** b\n- `c`");
    if (list.type !== "list") throw new Error("not a list");
    expect(list.items.map(show)).toEqual(["**a** b", "`c`"]);
    expect(paragraph("well - maybe\nor - not")).toBe("well - maybe⏎or - not");
  });
});

describe("code blocks", () => {
  it("keeps everything between the fences as typed, with no inline parsing", () => {
    const [code] = blocks("```\nif (a | b) {\n  x = **y**;\n\n  _z_\n}\n```");
    expect(code).toEqual({ type: "code", text: "if (a | b) {\n  x = **y**;\n\n  _z_\n}" });
  });

  it("accepts a language name after the opening fence and text around the block", () => {
    expect(kinds(blocks("Read this:\n```js\nlet a = 1;\n```\nWhat is a?"))).toEqual(["paragraph", "code", "paragraph"]);
  });

  it("takes the rest of the text when the fence is never closed, and says so", () => {
    const result = parseRichText("```\nlet a = 1;\nlet b = 2;");
    expect(result.blocks).toEqual([{ type: "code", text: "let a = 1;\nlet b = 2;" }]);
    expect(result.diagnostics).toEqual([expect.objectContaining({ kind: "unclosed-fence", line: 1 })]);
  });

  it("does not treat triple backticks inside a line of text as a fence (it is a code span)", () => {
    expect(kinds(blocks("use ```x``` here"))).toEqual(["paragraph"]);
    expect(paragraph("use ```x``` here")).toBe("use `x` here");
  });
});

describe("inline marks", () => {
  it("reads **bold**, _italic_ and `code`", () => {
    expect(paragraph("a **b** c _d_ e `f`")).toBe("a **b** c _d_ e `f`");
    expect(paragraph("**bold and _italic_**")).toBe("**bold and _italic_**");
  });

  it("does not read a single asterisk as italic", () => {
    expect(paragraph("2*3*4 and *x*")).toBe("2*3*4 and *x*");
  });

  it("needs a non-space next to the marks", () => {
    expect(paragraph("2 ** 3 ** 4")).toBe("2 ** 3 ** 4");
    expect(paragraph("a _ b _ c")).toBe("a _ b _ c");
    expect(paragraph("**not bold **")).toBe("**not bold **");
  });

  it("does not make italic inside a word", () => {
    expect(paragraph("snake_case_name and a_b_c")).toBe("snake_case_name and a_b_c");
    expect(paragraph("__init__ and _a_b")).toBe("__init__ and _a_b");
    expect(paragraph("_ok_ fine")).toBe("_ok_ fine");
  });

  it("leaves an unmatched mark as typed and still reads a later pair", () => {
    expect(paragraph("**open only")).toBe("**open only");
    expect(paragraph("a ** b **bold**")).toBe("a ** b **bold**");
    expect(paragraph("_open only")).toBe("_open only");
    expect(paragraph("****")).toBe("****");
  });

  it("reads `x**2 + y**2` as bold (a known edge: write it in backticks)", () => {
    expect(paragraph("x**2 + y**2")).toBe("x**2 + y**2");
    expect(blocks("x**2 + y**2")[0]).toMatchObject({
      children: [{ type: "text", text: "x" }, { type: "bold" }, { type: "text", text: "2" }],
    });
    expect(paragraph("`x**2 + y**2`")).toBe("`x**2 + y**2`");
  });

  it("shows an escaped mark literally", () => {
    expect(blocks("\\*a\\* \\_b\\_ \\| \\` \\\\")[0]).toEqual({
      type: "paragraph",
      children: [{ type: "text", text: "*a* _b_ | ` \\" }],
    });
    expect(blocks("**a\\**b**")[0]).toEqual({
      type: "paragraph",
      children: [{ type: "bold", children: [{ type: "text", text: "a**b" }] }],
    });
  });

  it("keeps a backslash that does not escape anything", () => {
    expect(blocks("C:\\new\\folder")[0]).toEqual({
      type: "paragraph",
      children: [{ type: "text", text: "C:\\new\\folder" }],
    });
  });

  it("does no inline parsing inside a code span", () => {
    expect(blocks("`**a** \\* _b_`")[0]).toEqual({
      type: "paragraph",
      children: [{ type: "code", text: "**a** \\* _b_" }],
    });
    expect(paragraph("``a`b``")).toBe("`a`b`");
    expect(paragraph("`open")).toBe("`open");
  });

  it("can hold a closing mark inside a code span without ending the bold", () => {
    expect(paragraph("**a `**` b**")).toBe("**a `**` b**");
  });

  it("works across a line break inside one paragraph", () => {
    expect(paragraph("**a\nb**")).toBe("**a⏎b**");
  });
});

describe("inline mode (options, reasons)", () => {
  it("allows the marks and line breaks only", () => {
    expect(kinds(inline("**a**\nb"))).toEqual(["paragraph"]);
    const [p] = inline("**a**\nb");
    if (p.type !== "paragraph") throw new Error("not a paragraph");
    expect(show(p.children)).toBe("**a**⏎b");
  });

  it("leaves a table, a list and a fence as text", () => {
    for (const text of ["| a | b |\n|---|---|\n| 1 | 2 |", "- a\n- b", "```\nx\n```"]) {
      expect(kinds(inline(text))).toEqual(["paragraph"]);
    }
    const [p] = inline("- a\n- b");
    if (p.type !== "paragraph") throw new Error("not a paragraph");
    expect(show(p.children)).toBe("- a⏎- b");
  });

  it("gives nothing for empty text", () => {
    expect(inline("  ")).toEqual([]);
  });
});

describe("diagnostics", () => {
  it("flags <br> and other HTML as shown text, with the line", () => {
    const result = parseRichText("one\nline<br>two\n<b>bold</b>");
    expect(result.diagnostics.map((d) => [d.kind, d.line])).toEqual([
      ["html-tag", 2],
      ["html-tag", 3],
    ]);
    expect(result.diagnostics[0].message).toContain("<br>");
    expect(paragraph("a<br>b")).toBe("a<br>b");
  });

  it("does not flag a comparison, a code span or a code block", () => {
    expect(parseRichText("if a<b and b>c then").diagnostics).toEqual([]);
    expect(parseRichText("write `<br>` for a break").diagnostics).toEqual([]);
    expect(parseRichText("```\n<div>x</div>\n```").diagnostics).toEqual([]);
  });

  it("flags HTML in inline mode too", () => {
    expect(parseRichText("a<br/>b", { blocks: "inline" }).diagnostics.map((d) => d.kind)).toEqual(["html-tag"]);
  });

  it("never changes the tree", () => {
    const text = "| a | b |\n| 1 | 2 |\n<br>";
    expect(parseRichText(text).blocks).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "| a | b |" }, { type: "break" }, { type: "text", text: "| 1 | 2 |" }, { type: "break" }, { type: "text", text: "<br>" }] },
    ]);
  });

  it("reports nothing for a clean question", () => {
    expect(parseRichText(SALES).diagnostics).toEqual([]);
  });
});

describe("toPlainText and hasStructure", () => {
  it("flattens a question to one line", () => {
    expect(toPlainText(blocks(SALES))).toBe(
      "A company recorded these sales figures. Region, Q1, Q2; North, 120, 150; South, 90, 80 Which region grew in Q2?"
    );
    expect(toPlainText(blocks("a\nb\n\n**c** `d`"))).toBe("a b c d");
    expect(toPlainText(blocks("- x\n- y"))).toBe("x; y");
    expect(toPlainText(blocks("```\na\nb\n```"))).toBe("a b");
    expect(toPlainText([])).toBe("");
  });

  it("is true for a table, a list or a code block only", () => {
    expect(hasStructure(blocks(SALES))).toBe(true);
    expect(hasStructure(blocks("- a\n- b"))).toBe(true);
    expect(hasStructure(blocks("```\nx\n```"))).toBe(true);
    expect(hasStructure(blocks("plain **bold** text\nsecond line"))).toBe(false);
    expect(hasStructure(blocks(""))).toBe(false);
  });
});
