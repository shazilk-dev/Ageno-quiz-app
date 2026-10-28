// R4 of docs/RICH_TEXT_PLAN.md: a question that holds a scenario, a table, a list or a code block goes
// through every way in and out (JSON, CSV, pasted cells, the plain-text format) with its line breaks.
// Pure code, no emulator.
//   npx vitest run __tests__/rich-text-import.test.ts
import { describe, expect, it } from "vitest";
import { checkRows } from "@/lib/quiz-format/checks";
import { replaceBreakTags } from "@/lib/quiz-format/breaks";
import { FULL_EXAMPLE } from "@/lib/quiz-format/examples";
import { pasteInstructions, rules, skillMarkdown } from "@/lib/quiz-format/instructions";
import { buildJsonSchema } from "@/lib/quiz-format/json-schema";
import { validateQuizFile } from "@/lib/quiz-format/validate";
import { parseQuizJson } from "@/lib/quiz-format/read";
import { allRows } from "@/lib/quiz-format/types";
import { exportCsv, exportJson, exportText, type ExportableQuiz } from "@/lib/quiz-format/write";
import { parseSpreadsheetText } from "@/lib/quiz-import/spreadsheet";
import { csvTemplate, TEXT_TEMPLATE } from "@/lib/quiz-import/templates";
import { parseQuizText } from "@/lib/quiz-import/text";
import { parseRichText } from "@/lib/rich-text/parse";
import { SCENARIO_EXAMPLE } from "@/lib/rich-text/example";
import type { EditorQuestion } from "@/lib/quiz-schema";

const TABLE = SCENARIO_EXAMPLE;
const LIST = "Which of these are true?\n\n- one\n- two\n- three\n\nPick the best.";
const SCENARIO_LIST = "Steps:\n1. open\n2. close\n3. save";
const CODE = "What does this print?\n\n```js\nconst a = 1;\n\n- not an option\n2. not a question\nconsole.log(a);\n```\n\nPick one.";
const CODE_FIRST = "```\nx = 1\n```\nWhat is x?";
const WRAPPED = "First line of a poem\nsecond line of a poem\nthird";
const PIPE_LINE = "Compare a | b and then\ndecide";
const LOOKALIKES = "Read this:\n- looks like an option\n* so does this\n~ and a reason\n> and a note\n! and an image\n# and a title\n3. and a question\n\\- already escaped";
const BLANKS = "One\n\n\nTwo";
const BACKSLASHES = "ends with a slash \\\nnext line\\\n\nafter";
const FENCE_AFTER = "Before\n```\ncode\n```\nafter the code\nmore text";

const CASES: Record<string, string> = {
  "plain": "Which protocol encrypts web traffic?",
  "scenario and table": TABLE,
  "list": LIST,
  "list with no blank lines": SCENARIO_LIST,
  "code": CODE,
  "code first": CODE_FIRST,
  "single line breaks in plain text": WRAPPED,
  "a line with a pipe": PIPE_LINE,
  "lines that look like marks": LOOKALIKES,
  "several blank lines": BLANKS,
  "trailing backslashes": BACKSLASHES,
  "text around a code block": FENCE_AFTER,
};

const quizWith = (text: string, explanation?: string): ExportableQuiz => ({
  title: "Round trip",
  duration: 20,
  examMode: "practice",
  showAnswerReview: true,
  levels: {
    easy: {
      duration: 20,
      pointsMultiplier: 1,
      questions: [
        { type: "single", text, options: [{ text: "Yes", isCorrect: true }, { text: "No", isCorrect: false }], ...(explanation ? { explanation } : {}) },
        { type: "single", text: "A second question follows.", options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }] },
      ],
    },
  },
});

const read = (parsed: ReturnType<typeof parseQuizText>): EditorQuestion[] =>
  checkRows(allRows(parsed)).flatMap((item) => (item.clean ? [item.clean] : []));

describe.each(Object.entries(CASES))("%s survives export and import", (_name, text) => {
  it("JSON", () => {
    const [first, second] = read(parseQuizJson(exportJson(quizWith(text, text))));
    expect(first.text).toBe(text);
    expect(first.explanation).toBe(text);
    expect(second.text).toBe("A second question follows.");
  });

  it("CSV", () => {
    const parsed = parseSpreadsheetText(exportCsv(quizWith(text, text)));
    expect(parsed.issues).toEqual([]);
    const [first, second] = read(parsed);
    expect(first.text).toBe(text);
    expect(first.explanation).toBe(text);
    expect(second.text).toBe("A second question follows.");
  });

  it("plain text", () => {
    const written = exportText(quizWith(text, text));
    const parsed = parseQuizText(written);
    expect(parsed.issues, written).toEqual([]);
    const [first, second] = read(parsed);
    expect(first.text, written).toBe(text);
    expect(first.explanation, written).toBe(text);
    expect(first.options.map((option) => option.text)).toEqual(["Yes", "No"]);
    expect(second.text).toBe("A second question follows.");
  });
});

describe("the plain-text format with structure", () => {
  it("keeps a scenario, a table and the question as one text", () => {
    const parsed = parseQuizText(
      ["1. A company recorded these sales figures.", "", "   | Region | Q1  | Q2  |", "   |:-------|----:|----:|", "   | North  | 120 | 150 |", "   | South  |  90 |  80 |", "", "   Which region grew in Q2?", "   - North", "   - [x] South"].join("\n")
    );
    expect(parsed.issues).toEqual([]);
    const [row] = parsed.unplaced;
    expect(row.question.text).toBe(
      "A company recorded these sales figures.\n\n| Region | Q1  | Q2  |\n|:-------|----:|----:|\n| North  | 120 | 150 |\n| South  |  90 |  80 |\n\nWhich region grew in Q2?"
    );
    expect(row.question.options.map((option) => option.text)).toEqual(["North", "South"]);
    const table = parseRichText(row.question.text).blocks.find((block) => block.type === "table");
    expect(table && table.type === "table" && table.rows).toHaveLength(2);
  });

  it("keeps the line breaks of table rows without a blank line before them", () => {
    const [row] = parseQuizText("1. Look at this\n| a | b |\n|---|---|\n| 1 | 2 |\n- x\n- [x] y").unplaced;
    expect(row.question.text).toBe("Look at this\n| a | b |\n|---|---|\n| 1 | 2 |");
  });

  it("still joins ordinary wrapped lines with a space", () => {
    const [row] = parseQuizText("1. A very long question that\nwraps onto a second line?\n- a\n- [x] b").unplaced;
    expect(row.question.text).toBe("A very long question that wraps onto a second line?");
  });

  it("keeps a line break where the line ends with a backslash, and reads a backslash before a mark as a plain line", () => {
    const [row] = parseQuizText("1. Pick from:\\\n\\- one\\\n\\- two\n- [x] a\n- b").unplaced;
    expect(row.question.text).toBe("Pick from:\n- one\n- two");
    expect(row.question.options).toHaveLength(2);
  });

  it("takes a code block exactly, even lines that look like options or questions", () => {
    const [row] = parseQuizText("1. Output?\n```\n- a\n\n2. b\n   indented\n```\n- [x] one\n- two").unplaced;
    expect(row.question.text).toBe("Output?\n```\n- a\n\n2. b\n   indented\n```");
    expect(row.question.options.map((option) => option.text)).toEqual(["one", "two"]);
  });

  it("says where a code block that never closes began, instead of swallowing the rest quietly", () => {
    const parsed = parseQuizText("1. Output?\n```\ncode\n- a\n- [x] b");
    const [row] = parsed.unplaced;
    expect(row.issues.some((issue) => issue.severity === "error" && /line 2: the code block never closes/.test(issue.message))).toBe(true);
    expect(checkRows([row])[0].status).toBe("error");
  });

  it("lets an explanation hold paragraphs and a table", () => {
    const [row] = parseQuizText("1. Q?\n- [x] a\n- b\n> Why:\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\nDone.\n! https://example.com/p.png").unplaced;
    expect(row.question.explanation).toBe("Why:\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\nDone.");
    expect(row.question.imageUrl).toBe("https://example.com/p.png");
  });

  it("still ignores loose text before the first question and after an option's blank line", () => {
    const parsed = parseQuizText("Intro\n\n1. Q?\n- a\n\nloose\n- [x] b");
    expect(parsed.issues.map((issue) => issue.message)).toEqual([
      "Line 1 was ignored (it isn't part of a question): Intro",
      "Line 6 was ignored (it isn't part of a question): loose",
    ]);
  });
});

describe("pasted spreadsheet cells and CSV with tables", () => {
  const sheet = (question: string) =>
    `level\tquestion\toption_a\toption_b\tcorrect\neasy\t${question}\tNorth\tSouth\tB`;

  it("reads the quoted cell Excel puts on the clipboard, with line breaks, pipes and doubled quotes", () => {
    const cell = `"A table:\n\n| Region | Note |\n|---|---|\n| North | ""big"" |\n\nWhich?"`;
    const parsed = parseSpreadsheetText(sheet(cell));
    expect(parsed.issues).toEqual([]);
    expect(parsed.levels.easy!.rows[0].question.text).toBe('A table:\n\n| Region | Note |\n|---|---|\n| North | "big" |\n\nWhich?');
  });

  it("turns Windows line ends inside a cell into plain line breaks", () => {
    const parsed = parseSpreadsheetText(sheet('"Line one\r\nLine two"'));
    expect(parsed.levels.easy!.rows[0].question.text).toBe("Line one\nLine two");
  });

  it("reads a CSV with the table in a quoted cell", () => {
    const csv = `level,question,option_a,option_b,correct\r\neasy,"${TABLE.replace(/"/g, '""')}",North,South,A\r\n`;
    const parsed = parseSpreadsheetText(csv);
    expect(parsed.levels.easy!.rows[0].question.text).toBe(TABLE);
  });
});

describe("<br> from an AI", () => {
  it("becomes a line break, or a space inside a table row, and leaves code alone", () => {
    expect(replaceBreakTags("one<br>two<br/>three<BR />four")).toBe("one\ntwo\nthree\nfour");
    expect(replaceBreakTags("| a | b<br>c |\n|---|---|\n| 1 | 2 |")).toBe("| a | b c |\n|---|---|\n| 1 | 2 |");
    expect(replaceBreakTags("```\nprint('<br>')\n```\nafter<br>x")).toBe("```\nprint('<br>')\n```\nafter\nx");
    expect(replaceBreakTags("no tags here")).toBe("no tags here");
  });

  it("is done by every reader, with a warning", () => {
    const json = JSON.stringify({
      format: "ageno-quiz",
      version: 1,
      levels: { easy: { questions: [{ text: "Scenario<br><br>Question?", options: [{ text: "a<br>b", isCorrect: true }, { text: "c", isCorrect: false }], explanation: "x<br>y" }] } },
    });
    for (const parsed of [
      parseQuizJson(json),
      parseQuizText("1. Scenario<br><br>Question?\n- [x] a<br>b\n- c\n> x<br>y"),
      parseSpreadsheetText("level\tquestion\toption_a\toption_b\tcorrect\texplanation\neasy\tScenario<br><br>Question?\ta<br>b\tc\tA\tx<br>y"),
    ]) {
      const [row] = allRows(parsed);
      expect(row.question.text).toBe("Scenario\n\nQuestion?");
      expect(row.question.options[0].text).toBe("a\nb");
      expect(row.question.explanation).toBe("x\ny");
      expect(row.issues.some((issue) => issue.severity === "warning" && issue.message.startsWith("<br> was turned into a line break"))).toBe(true);
      expect(parseRichText(row.question.text).diagnostics).toEqual([]);
    }
  });
});

const fileWith = (text: string, options = [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }]) =>
  JSON.stringify({ format: "ageno-quiz", version: 1, quiz: { title: "T" }, levels: { easy: { questions: [{ text, options }] } } });

describe("the warnings a file gets for its formatting", () => {
  it("none for a good table, a list, code or plain text", () => {
    for (const text of [TABLE, LIST, CODE, "Plain?"]) {
      const report = validateQuizFile(fileWith(text));
      expect(report.errors).toEqual([]);
      expect(report.warnings).toEqual([]);
    }
  });

  it("a table with a missing delimiter row, a wrong cell count or HTML is a warning, never an error", () => {
    const noDelimiter = validateQuizFile(fileWith("Intro\n\n| a | b |\n| 1 | 2 |\n\nWhich?"));
    const cells = validateQuizFile(fileWith("| a | b |\n|---|---|\n| 1 | 2 | 3 |"));
    const html = validateQuizFile(fileWith("Use <b>this</b>"));
    for (const report of [noDelimiter, cells, html]) {
      expect(report.ok).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.warnings).toHaveLength(1);
    }
    expect(noDelimiter.warnings[0]).toMatch(/^Easy · question 1: Question text, line \d: /);
    expect(cells.warnings[0]).toMatch(/cells/);
    expect(html.warnings[0]).toMatch(/HTML/);
  });

  it("says when a table is wide or long", () => {
    const row = (n: number) => `| ${Array.from({ length: n }, (_, i) => i).join(" | ")} |`;
    const wide = validateQuizFile(fileWith(`${row(8)}\n|${"---|".repeat(8)}\n${row(8)}`));
    expect(wide.warnings.join("\n")).toMatch(/8 columns/);
    const long = validateQuizFile(fileWith(`| a |\n|---|\n${Array.from({ length: 30 }, () => "| x |").join("\n")}`));
    expect(long.warnings.join("\n")).toMatch(/30 rows/);
  });

  it("is a warning on the row in the import checks, so the wizard marks it and still imports it", () => {
    const [row] = allRows(parseQuizJson(fileWith("| a | b |\n|---|---|\n| 1 | 2 | 3 |")));
    const [checked] = checkRows([row]);
    expect(checked.status).toBe("warning");
    expect(checked.clean).not.toBeNull();
  });
});

describe("what the AI is told, and given", () => {
  it("the rules allow the Markdown subset, ask for tables as tables, and no longer say plain text only", () => {
    const text = rules();
    expect(text).not.toMatch(/Plain text only/);
    expect(text).toMatch(/Keep a table as a table/);
    expect(text).toMatch(/never replace it with an `imageUrl`/);
    expect(text).toMatch(/`---:`/);
    expect(text).toMatch(/No HTML/);
    for (const copy of [skillMarkdown(), pasteInstructions(JSON.stringify(buildJsonSchema()))]) {
      expect(copy).toContain("Keep a table as a table");
      expect(copy).toContain("| Region | Q1  | Q2  |");
    }
  });

  it("the schema describes the subset for text and explanation", () => {
    const question = buildJsonSchema().$defs.question.properties;
    expect(question.text.description).toMatch(/Markdown/);
    expect(question.explanation.description).toMatch(/tables/);
  });

  it("the full example holds a scenario with a table and a list", () => {
    const levels = FULL_EXAMPLE.levels as Record<string, { questions: { text: string }[] }>;
    const texts = Object.values(levels).flatMap((level) => level.questions.map((question) => question.text));
    const blocks = texts.flatMap((text) => parseRichText(text).blocks.map((block) => block.type));
    expect(blocks).toContain("table");
    expect(blocks).toContain("list");
  });

  it("the text template reads with a table question and a list question", () => {
    const parsed = parseQuizText(TEXT_TEMPLATE);
    expect(parsed.issues).toEqual([]);
    const [, , table, list] = parsed.levels.easy!.rows.map((row) => row.question);
    expect(parseRichText(table.text).blocks.map((block) => block.type)).toEqual(["paragraph", "table", "paragraph"]);
    expect(list.text.split("\n").slice(1)).toEqual(["- Stop the database", "- Copy the data files", "- Start the database", "Which step should come before the copy?"]);
    expect(parseRichText(list.text).blocks.map((block) => block.type)).toContain("list");
    expect(list.options).toHaveLength(2);
    expect(checkRows(allRows(parsed)).every((item) => item.status === "ok")).toBe(true);
  });

  it("the CSV template's second sample row is a scenario with a table once its # is taken off", () => {
    const parsed = parseSpreadsheetText(csvTemplate().replace(/#easy/g, "easy"));
    expect(parsed.issues).toEqual([]);
    const [plain, table] = parsed.levels.easy!.rows;
    expect(plain.question.text).toBe("Which protocol encrypts web traffic?");
    expect(table.question.text).toBe(TABLE);
    expect(checkRows(allRows(parsed)).every((item) => item.status === "ok")).toBe(true);
  });
});
