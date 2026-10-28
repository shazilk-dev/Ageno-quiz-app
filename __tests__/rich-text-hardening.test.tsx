// @vitest-environment jsdom
// Rich text hardening (docs/RICH_TEXT_PLAN.md, R5): plain questions render word for word as before (golden),
// random input never throws or leaves the allowed set of elements (fuzz), and hostile input stays inert text
// (safety):
//   npx vitest run __tests__/rich-text-hardening.test.tsx
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RichText from "@/components/rich-text/RichText";
import { parseRichText } from "@/lib/rich-text/parse";
import { toPlainText } from "@/lib/rich-text/plain";
import type { Block, Inline } from "@/lib/rich-text/types";

afterEach(cleanup);

/** Waits until the lazy table and code chunks have replaced their grey placeholders. */
const settled = (container: HTMLElement) =>
  waitFor(() => expect(container.querySelector('[aria-hidden="true"].h-20')).toBeNull());

/** Every element RichText may produce. Anything else (script, img, a, iframe, style, svg...) is a failure. */
const ALLOWED_TAGS = new Set([
  "DIV", "SPAN", "P", "BR", "STRONG", "EM", "CODE", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "PRE",
]);
const FORBIDDEN_ATTRIBUTES = /^(on|href$|src$|srcdoc$|action$|formaction$|xlink)/i;

function assertInert(root: HTMLElement) {
  for (const el of root.querySelectorAll("*")) {
    expect(ALLOWED_TAGS.has(el.tagName), `unexpected <${el.tagName.toLowerCase()}>`).toBe(true);
    for (const attr of el.getAttributeNames()) {
      expect(FORBIDDEN_ATTRIBUTES.test(attr), `unexpected attribute ${attr} on <${el.tagName.toLowerCase()}>`).toBe(false);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// R5.1 Golden: plain questions show the same words as before the rich text work.
// ---------------------------------------------------------------------------------------------------------
describe("golden: plain questions render word for word", () => {
  // Texts a question might hold today, including the awkward ones: pipes, asterisks, underscores, dashes,
  // numbers with a dot, and HTML-looking text. None of them may turn into a table, list, bold, italic, code.
  const PLAIN = [
    "Which planet is closest to the sun?",
    "First line\nSecond line",
    "First paragraph.\n\nSecond paragraph.",
    "A | B | C",
    "a|b",
    "a | b - c * d _ e",
    "Compute 3 * 4 * 5 and 6 * 2",
    "Use 2*3*4 and snake_case_name",
    "file_name_final.txt and my_var_2",
    "mixed *star* here",
    "a ** b and c ** d",
    "Which is correct: a - b or a -- b?",
    "1. only one numbered line",
    "1) only one bracket line",
    "- a lone dash",
    "+ a lone plus",
    "Name:\n1. Alice",
    "Line one\n- not a list",
    "Step 1. Open the file, then 2. close it",
    "Is 5 > 3 and 2 < 4?",
    "What does <b> do in HTML?",
    "Use <b>bold</b> or <i>it</i> here",
    "Path C:\\new\\folder",
    "Price: $5 * 2 = $10",
    "Is 2^3 = 8? [yes] (no) {maybe}",
    "Mail a@b.com or see http://example.com/x_y_z",
    "![alt](http://example.com/y.png)",
    "Unicode: Ωmega — “quoted” ✓ é",
    "100% sure? yes/no",
  ];

  it.each(PLAIN)("%j", (text) => {
    const { container } = render(<RichText text={text} />);
    // The words, in order, with a <br> where the author put a single line break.
    expect(container.textContent).toBe(text.replace(/\n/g, ""));
    expect(container.querySelector("table, ul, ol, pre, strong, em, code, a, img")).toBeNull();
    expect(container.querySelectorAll("br")).toHaveLength((text.match(/(?<!\n)\n(?!\n)/g) ?? []).length);
    // Inline mode (options, reasons) shows the same words too.
    const inline = render(<RichText text={text} mode="inline" />);
    expect(inline.container.textContent).toBe(text.replace(/\n/g, ""));
    expect(inline.container.querySelector("strong, em, code")).toBeNull();
  });

  it("gives plain text the tree of paragraphs and breaks only, and no advice", () => {
    for (const text of PLAIN) {
      const { blocks, diagnostics } = parseRichText(text);
      expect(
        blocks.every((block) => block.type === "paragraph"),
        text
      ).toBe(true);
      // Only the HTML-looking ones may draw advice (a `<b>` is shown as text; the author is told).
      if (!/<\/?[a-z]/i.test(text)) expect(diagnostics, text).toEqual([]);
    }
  });

  // The documented edge cases (docs/RICH_TEXT_PLAN.md, "Known edge cases"): these are meant to change, and
  // `npm run scan:richtext` finds them in stored data. The test pins the behaviour so it cannot drift.
  it("pins the documented cases that do change", () => {
    const strong = (text: string) => render(<RichText text={text} />).container.querySelector("strong")?.textContent;
    expect(strong("x**2 + y**2")).toBe("2 + y");
    expect(strong("Use `**` for powers")).toBeUndefined();
    const list = render(<RichText text={"1. one\n2. two"} />).container.querySelector("ol");
    expect(list?.querySelectorAll("li")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------
// R5.2 Fuzz: random strings never throw, finish fast and stay inside the allowed tree.
// ---------------------------------------------------------------------------------------------------------

/** A small seeded generator, so a failure can be replayed. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  "|", "|", "|", "-", "---", "|---|", "|:--:|--:|", ":", "*", "**", "_", "__", "`", "```", "\\", "\\|", "\n", "\n", "\n\n",
  " ", " ", "  ", "\t", "\r\n", "1.", "2)", "- ", "* ", "+ ", "<br>", "<b>", "<script>", "</", "[", "](", ")", "!", "&amp;",
  "a", "b", "word", "0", "é", "✓", "| a | b |\n", "| 1 | 2 | 3 |\n",
  // Whole constructs, so the generator reaches tables, lists and code blocks (a test below checks that it does).
  "\n\n| a | b |\n|---|--:|\n| 1 | 2 |\n", "\n\na | b\n:-:|---\n1 | **2**\n", "\n\n```\ncode\n```\n", "\n\n- x\n- y\n", "\n\n1. x\n2. y\n",
  "x**2", "snake_case", "\u0000", "\u202e",
];

function randomText(next: () => number, length: number): string {
  let out = "";
  while (out.length < length) out += PIECES[Math.floor(next() * PIECES.length)];
  return out;
}

const INLINE_TYPES = new Set(["text", "bold", "italic", "code", "break"]);
const BLOCK_TYPES = new Set(["paragraph", "table", "list", "code"]);

function checkInlines(nodes: Inline[]) {
  for (const node of nodes) {
    expect(INLINE_TYPES.has(node.type)).toBe(true);
    if (node.type === "bold" || node.type === "italic") checkInlines(node.children);
  }
}

function checkTree(blocks: Block[], inlineOnly: boolean) {
  for (const block of blocks) {
    expect(BLOCK_TYPES.has(block.type)).toBe(true);
    if (inlineOnly) expect(block.type).toBe("paragraph");
    if (block.type === "paragraph") checkInlines(block.children);
    if (block.type === "table") {
      expect(block.align).toHaveLength(block.header.length);
      for (const cell of block.header) checkInlines(cell);
      for (const row of block.rows) {
        expect(row).toHaveLength(block.header.length);
        for (const cell of row) checkInlines(cell);
      }
    }
    if (block.type === "list") {
      expect(block.items.length).toBeGreaterThanOrEqual(2);
      for (const item of block.items) checkInlines(item);
    }
  }
}

const SLOW_MS = 400; // a 4000-character text parses in a few ms; this only catches a runaway

describe("fuzz: the parser", () => {
  it("never throws and stays inside the tree for 600 random texts", () => {
    const next = mulberry32(20261028);
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const text = randomText(next, Math.floor(next() * 500));
      for (const mode of ["all", "inline"] as const) {
        const result = parseRichText(text, { blocks: mode });
        if (mode === "all") for (const block of result.blocks) seen.add(block.type);
        checkTree(result.blocks, mode === "inline");
        expect(() => toPlainText(result.blocks)).not.toThrow();
        for (const d of result.diagnostics) expect(d.line).toBeGreaterThanOrEqual(1);
      }
    }
    // The generator must actually reach every construct, or this test proves little.
    expect([...seen].sort()).toEqual(["code", "list", "paragraph", "table"]);
  });

  it("gives the same tree for the same text", () => {
    const next = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const text = randomText(next, 300);
      expect(parseRichText(text)).toEqual(parseRichText(text));
    }
  });

  it("handles the worst-case 4000-character texts quickly", () => {
    const cases: Record<string, string> = {
      "unmatched bold": "**a ".repeat(1000),
      "unmatched italic": "_a ".repeat(1300),
      "unmatched code": "`a ".repeat(1300),
      "only pipes": "|".repeat(4000),
      "pipes and newlines": "|\n".repeat(2000),
      "backslashes": "\\".repeat(4000),
      "backslash before every mark": "\\*_`|".repeat(800),
      "nested marks": "**_`".repeat(1000),
      "list marks": "- a\n".repeat(1000),
      "numbered marks": "1. a\n".repeat(800),
      "header and delimiter rows": "| a | b |\n|---|---|\n".repeat(200),
      "fences": "```\n".repeat(1000),
      "blank lines": "\n".repeat(4000),
      "long line": "word ".repeat(800),
      "random": randomText(mulberry32(99), 4000),
    };
    for (const [name, text] of Object.entries(cases)) {
      const start = performance.now();
      const result = parseRichText(text);
      toPlainText(result.blocks);
      const took = performance.now() - start;
      expect(took, `${name} took ${took.toFixed(0)} ms`).toBeLessThan(SLOW_MS);
      checkTree(result.blocks, false);
    }
  });

  it("reads a 200-row table and a 5000-row one into rows, fast", () => {
    for (const rows of [200, 5000]) {
      const body = Array.from({ length: rows }, (_, i) => `| row ${i} | ${i} | **${i}** |`).join("\n");
      const text = `| Name | N | B |\n|:--|--:|:-:|\n${body}`;
      const start = performance.now();
      const { blocks } = parseRichText(text);
      expect(performance.now() - start).toBeLessThan(SLOW_MS * 2);
      expect(blocks).toHaveLength(1);
      const table = blocks[0];
      expect(table.type).toBe("table");
      if (table.type === "table") expect(table.rows).toHaveLength(rows);
    }
  });
});

describe("fuzz: the renderer", () => {
  it("renders random texts in both modes with only the allowed elements", async () => {
    const next = mulberry32(424242);
    for (let i = 0; i < 40; i++) {
      const text = randomText(next, Math.floor(next() * 600));
      for (const mode of ["blocks", "inline"] as const) {
        const { container, unmount } = render(<RichText text={text} mode={mode} />);
        await settled(container);
        assertInert(container);
        unmount();
      }
    }
  });

  it("renders a 4000-character text and a 200-row table", async () => {
    const big = render(<RichText text={randomText(mulberry32(5), 4000)} />);
    await settled(big.container);
    assertInert(big.container);
    big.unmount();

    const rows = Array.from({ length: 200 }, (_, i) => `| ${i} | x${i} |`).join("\n");
    const { container } = render(<RichText text={`| N | X |\n|--:|---|\n${rows}`} />);
    await settled(container);
    assertInert(container);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(200);
  });
});

// ---------------------------------------------------------------------------------------------------------
// R5.3 Safety: hostile text is shown as text, in every place text can sit.
// ---------------------------------------------------------------------------------------------------------
describe("safety", () => {
  const HOSTILE = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>",
    "<iframe src=\"javascript:alert(1)\"></iframe>",
    '<a href="javascript:alert(1)">click</a>',
    "<style>body{display:none}</style>",
    "[click](javascript:alert(1))",
    "[click](http://evil.example/)",
    "<http://evil.example/>",
    "![x](http://evil.example/a.png)",
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "**<img src=x onerror=alert(1)>**",
    "`<script>alert(1)</script>`",
  ];

  const places: Array<[string, (evil: string) => string, "blocks" | "inline"]> = [
    ["a paragraph", (e) => `Before\n\n${e}\n\nAfter`, "blocks"],
    ["a table cell", (e) => `| h |\n|---|\n| ${e} |`, "blocks"],
    ["a table header", (e) => `| ${e} |\n|---|\n| a |`, "blocks"],
    ["a list item", (e) => `- ${e}\n- other`, "blocks"],
    ["bold", (e) => `**${e}**`, "blocks"],
    ["an option (inline)", (e) => e, "inline"],
  ];

  for (const [place, wrap, mode] of places) {
    it(`keeps hostile text inert in ${place}`, async () => {
      for (const evil of HOSTILE) {
        const { container, unmount } = render(<RichText text={wrap(evil)} mode={mode} />);
        await settled(container);
        assertInert(container);
        expect(container.querySelector("script, img, a, iframe, style, svg, object, embed, link, form")).toBeNull();
        unmount();
      }
    });
  }

  it("shows the typed characters of a link or an image, not a link or an image", () => {
    const { container } = render(<RichText text={"[click](http://evil.example/) and ![x](http://evil.example/a.png)"} />);
    expect(container.textContent).toBe("[click](http://evil.example/) and ![x](http://evil.example/a.png)");
    expect(container.querySelector("a, img")).toBeNull();
  });

  it("never builds HTML from text: no dangerouslySetInnerHTML, innerHTML or friends in the rich-text code", () => {
    const roots = ["lib/rich-text", "components/rich-text", "components/admin/quiz-editor", "components/quiz/exam"];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) files.push(path);
      }
    };
    for (const root of roots) walk(join(process.cwd(), root));
    expect(files.length).toBeGreaterThan(20);
    const banned = /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\(/;
    const offenders = files.filter((file) => banned.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
