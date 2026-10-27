// Unit tests for the import side of A2: delimited text, spreadsheet columns, the plain-text format, export
// round trips, the templates, and the arithmetic of "what will this import do". Pure code.
//   npx vitest run __tests__/quiz-import.test.ts
import { describe, expect, it } from "vitest";
import { checkRows, summarize } from "@/lib/quiz-format/checks";
import { FULL_EXAMPLE } from "@/lib/quiz-format/examples";
import { parseQuizJson } from "@/lib/quiz-format/read";
import { allRows } from "@/lib/quiz-format/types";
import { exportCsv, exportJson, exportText, type ExportableQuiz } from "@/lib/quiz-format/write";
import { applyImport, describeDiff, diffQuestions } from "@/lib/quiz-import/apply";
import { detectColumns, parseCorrect, parseSpreadsheetText } from "@/lib/quiz-import/spreadsheet";
import { csvTemplate, TEXT_TEMPLATE } from "@/lib/quiz-import/templates";
import { csvCell, detectDelimiter, parseTable, unescapeCell } from "@/lib/quiz-import/table";
import { parseQuizText } from "@/lib/quiz-import/text";
import { emptyExisting, planQuestionWrites } from "@/lib/quiz-writes";
import { questionToDoc, type EditorQuestion, type Level, type LevelInput } from "@/lib/quiz-schema";

describe("parseTable", () => {
  it("splits on commas, tabs and semicolons, picking the one the first line uses", () => {
    expect(parseTable("a,b,c\n1,2,3").records).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseTable("a\tb\tc\n1\t2\t3").delimiter).toBe("\t");
    expect(parseTable("a;b;c\n1;2;3").records[1]).toEqual(["1", "2", "3"]);
    expect(detectDelimiter("one cell\nx,y")).toBe("\t");
    // A comma inside quotes on the first line doesn't count.
    expect(detectDelimiter('"a,b,c"\tx\n')).toBe("\t");
  });

  it("handles quoted commas, doubled quotes and line breaks inside a cell", () => {
    const table = parseTable('q,a\n"Hello, ""world""","line1\nline2"\n');
    expect(table.records).toEqual([["q", "a"], ['Hello, "world"', "line1\nline2"]]);
  });

  it("handles a byte order mark, CRLF, CR and no final newline", () => {
    expect(parseTable("﻿a,b\r\n1,2\r\n").records).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseTable("a,b\r1,2").records).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps empty cells and empty trailing rows as they are", () => {
    expect(parseTable("a,,c\n,,\n").records).toEqual([["a", "", "c"], ["", "", ""]]);
    expect(parseTable('"",x').records).toEqual([["", "x"]]);
  });

  it("keeps a quote in the middle of a cell and text after a closing quote", () => {
    expect(parseTable('5" screen,"a"b').records).toEqual([['5" screen', "ab"]]);
  });

  it("reports a quoted cell that never closes", () => {
    expect(parseTable('a,b\n1,"oops\n2,3').unterminated).toBe(2);
    expect(parseTable("a,b\n1,2").unterminated).toBeNull();
  });

  it("writes cells a spreadsheet can't run as formulas, and reads them back", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(unescapeCell("'=1+1")).toBe("=1+1");
    expect(unescapeCell("it's")).toBe("it's");
  });
});

describe("columns", () => {
  it("finds columns by name whatever the case, spacing and order", () => {
    const map = detectColumns(["Question", "Option A", "option_b", "OPTION C", "Correct answer", "A why", "Reason B", "Image URL", "Notes", "Colour"]);
    expect(map.fields).toEqual({
      question: 0,
      option_a: 1,
      option_b: 2,
      option_c: 3,
      correct: 4,
      why_a: 5,
      why_b: 6,
      image: 7,
      note: 8,
    });
    expect(map.ignored).toEqual(["Colour"]);
  });

  it("notes duplicate headers and uses the first", () => {
    const map = detectColumns(["question", "question", "a", "b", "correct"]);
    expect(map.duplicated).toEqual(["question"]);
    expect(map.fields.question).toBe(0);
    expect(map.fields.option_a).toBe(2);
  });
});

describe("the correct-answer cell", () => {
  const options = ["Paris", "London", "Rome", "Berlin"];
  const picked = (cell: string, list = options) => parseCorrect(cell, list).indexes;

  it("reads a letter in either case, a number, or the text of the option", () => {
    expect(picked("B")).toEqual([1]);
    expect(picked("b")).toEqual([1]);
    expect(picked("3")).toEqual([2]);
    expect(picked(" rome ")).toEqual([2]);
  });

  it("reads lists for select-all questions", () => {
    expect(picked("A,C")).toEqual([0, 2]);
    expect(picked("1; 3")).toEqual([0, 2]);
    expect(picked("A and D")).toEqual([0, 3]);
    expect(picked("c a")).toEqual([0, 2]);
  });

  it("lets the exact text of an option win over a letter or number, and says so", () => {
    const result = parseCorrect("2", ["1", "2", "3", "4"]);
    expect(result.indexes).toEqual([1]);
    expect(result.issues).toEqual([]); // "2" is option 2's text and also means option 2: no conflict
    const clash = parseCorrect("3", ["4", "5", "3", "6"].reverse());
    expect(clash.indexes).toEqual([1]);
    expect(clash.issues[0].message).toMatch(/is the text of option 2 and also names option 3/);
  });

  it("explains a cell it can't use", () => {
    expect(parseCorrect("", options).issues[0].message).toBe("the correct answer is empty.");
    expect(parseCorrect("F", options).issues[0].message).toBe("the correct answer names option F, but there are only 4 options.");
    expect(parseCorrect("Madrid", options).issues[0].message).toBe('the correct answer "Madrid" isn\'t a letter, a number or the text of an option.');
    expect(parseCorrect("Madrid", options).indexes).toEqual([]);
  });
});

describe("reading spreadsheet text", () => {
  const sheet = [
    "level\ttype\tquestion\toption_a\toption_b\toption_c\tcorrect\texplanation\ta_why\tb_why",
    "easy\t\tWhich protocol encrypts web traffic?\tHTTP\tHTTPS\tFTP\tB\tThe S stands for secure.\tPlain text.\tTLS on top.",
    "hard\tmultiple\tPick the primes\t2\t4\t3\tA,C\t\t\t",
    "",
    "# a comment row\t\t\t\t\t\t\t\t\t",
    "\t\tNo level given\tx\ty\t\tx\t\t\t",
  ].join("\n");

  it("turns rows into questions, places them by level and numbers rows like the spreadsheet does", () => {
    const parsed = parseSpreadsheetText(sheet);
    expect(parsed.issues).toEqual([]);
    const [first] = parsed.levels.easy!.rows;
    expect(first.source).toBe("Row 2");
    expect(first.question).toEqual({
      type: "single",
      text: "Which protocol encrypts web traffic?",
      options: [
        { text: "HTTP", isCorrect: false, rationale: "Plain text." },
        { text: "HTTPS", isCorrect: true, rationale: "TLS on top." },
        { text: "FTP", isCorrect: false },
      ],
      explanation: "The S stands for secure.",
    });
    const [multi] = parsed.levels.hard!.rows;
    expect(multi.question.type).toBe("multiple");
    expect(multi.question.options.map((o) => o.isCorrect)).toEqual([true, false, true]);
    expect(parsed.unplaced).toHaveLength(1);
    expect(parsed.unplaced[0].source).toBe("Row 6");
    expect(parsed.unplaced[0].question.options).toHaveLength(2); // the empty option_c is dropped
  });

  it("reads a CSV with quotes, a byte order mark, CRLF and a line break inside a cell", () => {
    const csv = '﻿question,option_a,option_b,correct\r\n"Which, if any,\nis right?","one, 1","two",B\r\n';
    const parsed = parseSpreadsheetText(csv);
    expect(parsed.issues).toEqual([]);
    expect(parsed.unplaced[0].question.text).toBe("Which, if any,\nis right?");
    expect(parsed.unplaced[0].question.options[0].text).toBe("one, 1");
  });

  it("keeps a gap in the middle of the options so it gets reported", () => {
    const parsed = parseSpreadsheetText("question,option_a,option_b,option_c,correct\nQ,a,,c,A");
    const [checked] = checkRows(parsed.unplaced);
    expect(checked.status).toBe("error");
    expect(checked.issues.map((i) => i.message)).toContain("option 2 is empty.");
  });

  it("reports per row what is wrong and keeps going", () => {
    const parsed = parseSpreadsheetText(
      ["question,level,type,option_a,option_b,correct", "Fine,easy,,a,b,A", "Bad level,expert,,a,b,A", "Bad type,easy,essay,a,b,A", "Bad answer,easy,,a,b,Z"].join("\n")
    );
    const checked = checkRows(allRows(parsed));
    const at = (row: number) => checked.find((c) => c.row.source === `Row ${row}`)!;
    expect(["Row 2", "Row 3", "Row 4", "Row 5"].map((_, i) => at(i + 2).status)).toEqual(["ok", "error", "error", "error"]);
    expect(at(3).issues[0].message).toBe("the level \"expert\" isn't one of easy, medium, hard.");
    expect(at(4).issues[0].message).toBe("the type \"essay\" isn't single or multiple.");
    expect(at(5).issues[0].message).toBe("the correct answer names option Z, but there are only 2 options.");
    expect(summarize([at(2), at(3), at(4), at(5)]).text).toBe("4 questions: 1 ready, 3 need fixing (Row 3, Row 4, Row 5)");
  });

  it("explains a missing column or an empty paste", () => {
    expect(parseSpreadsheetText("question,option_a\nQ,a").issues[0].message).toMatch(/couldn't find at least two option columns \(option_a, option_b\), correct/);
    expect(parseSpreadsheetText("  ").issues[0].message).toBe("There is nothing to import.");
    expect(parseSpreadsheetText("# only a comment").issues[0].message).toMatch(/nothing to import/);
    expect(parseSpreadsheetText("question,option_a,option_b,correct").issues[0].message).toMatch(/no questions under it/);
  });

  it("flags a quote that never closes", () => {
    const parsed = parseSpreadsheetText('question,option_a,option_b,correct\n"oops,a,b,A');
    expect(parsed.issues[0].message).toMatch(/never closes/);
  });

  it("takes a type word a person might write", () => {
    const parsed = parseSpreadsheetText("question,type,option_a,option_b,correct\nQ,Select all,a,b,\"A,B\"");
    expect(parsed.unplaced[0].question.type).toBe("multiple");
  });

  it("imports the template as it is: nothing, because every row in it is a comment", () => {
    const parsed = parseSpreadsheetText(csvTemplate());
    expect(parsed.issues[0].message).toMatch(/no questions under it/);
  });

  it("imports the template's sample row once its # is removed", () => {
    const parsed = parseSpreadsheetText(csvTemplate().replace("#easy", "easy"));
    expect(parsed.issues).toEqual([]);
    expect(parsed.levels.easy!.rows).toHaveLength(1);
    expect(checkRows(allRows(parsed))[0].status).toBe("ok");
  });
});

describe("reading the plain-text format", () => {
  it("reads the template: title, levels with minutes and multiplier, reasons, explanation, image", () => {
    const parsed = parseQuizText(TEXT_TEMPLATE);
    expect(parsed.issues).toEqual([]);
    expect(parsed.shape).toBe("quiz");
    expect(parsed.settings.title).toBe("Network basics");
    expect(parsed.levels.easy).toMatchObject({ duration: 20, pointsMultiplier: 1 });
    expect(parsed.levels.hard).toMatchObject({ duration: 30, pointsMultiplier: 1.5 });
    const [first, second] = parsed.levels.easy!.rows;
    expect(first.source).toBe("Line 5");
    expect(first.question).toEqual({
      type: "single",
      text: "Which protocol encrypts web traffic?",
      options: [
        { text: "HTTP", isCorrect: false, rationale: "Sends data in plain text." },
        { text: "HTTPS", isCorrect: true, rationale: "Adds TLS on top of HTTP." },
        { text: "FTP", isCorrect: false },
      ],
      explanation: "The S stands for secure.",
    });
    expect(second.question.type).toBe("multiple");
    expect(parsed.levels.hard!.rows[0].question.imageUrl).toBe("https://example.com/handshake.png");
    expect(checkRows(allRows(parsed)).every((c) => c.status === "ok")).toBe(true);
  });

  it("continues wrapped lines and ignores indentation", () => {
    const parsed = parseQuizText(["1. A very long question that", "wraps onto a second line?", "- first", "  option", "~ reason that", "  also wraps", "- [X] second", "> and the", "explanation"].join("\n"));
    const [row] = parsed.unplaced;
    expect(row.question.text).toBe("A very long question that wraps onto a second line?");
    expect(row.question.options[0]).toEqual({ text: "first option", isCorrect: false, rationale: "reason that also wraps" });
    expect(row.question.options[1].isCorrect).toBe(true);
    expect(row.question.explanation).toBe("and the explanation");
  });

  it("puts questions before any level header in the unplaced list, and numbers can restart", () => {
    const parsed = parseQuizText("1. Q one\n- a\n- [x] b\n\n## Medium\n1. Q two\n- a\n- [x] b");
    expect(parsed.unplaced).toHaveLength(1);
    expect(parsed.levels.medium!.rows[0].question.text).toBe("Q two");
  });

  it("says what it ignored or couldn't understand", () => {
    const parsed = parseQuizText("Some intro text\n## Expert\n1. Q\n- a\n- [x] b\n## Easy | soon | x2\n1. Q2\n~ reason first\n- a\n- [x] b");
    const messages = parsed.issues.map((i) => i.message);
    expect(messages[0]).toBe("Line 1 was ignored (it isn't part of a question): Some intro text");
    expect(messages[1]).toBe('Line 2: "Expert" isn\'t a level. Use easy, medium, hard.');
    expect(messages[2]).toMatch(/"soon" in the level line wasn't understood/);
    expect(parsed.levels.easy!.pointsMultiplier).toBe(2);
    expect(parsed.levels.easy!.rows[0].issues[0].message).toMatch(/a reason \("~"\) must come after the option/);
  });

  it("finds nothing in text without questions", () => {
    expect(parseQuizText("hello").issues.at(-1)?.message).toMatch(/Start each question with a number/);
    expect(parseQuizText("").issues[0].message).toBe("There is nothing to import.");
  });
});

// A quiz with awkward content, used for the round trips.
const q = (text: string, extra: Partial<EditorQuestion> = {}): EditorQuestion => ({
  type: "single",
  text,
  options: [
    { text: "Yes, \"quoted\"", isCorrect: true, rationale: "Because, commas." },
    { text: "=SUM(A1)", isCorrect: false },
    { text: "Three", isCorrect: false, rationale: "Line one\nline two" },
  ],
  explanation: "An explanation.",
  ...extra,
});
const level = (questions: EditorQuestion[], duration = 20, pointsMultiplier = 1): LevelInput => ({
  duration,
  pointsMultiplier,
  questions,
});
const sample: ExportableQuiz = {
  title: "Round trip",
  description: "Back and forth",
  duration: 25,
  examMode: "strict",
  showAnswerReview: false,
  levels: {
    easy: level([q("First?", { id: "id_1" }), q("Second, with a comma?", { id: "id_2", type: "multiple", options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: true }, { text: "C", isCorrect: false }] })]),
    hard: level([q("Third?", { id: "id_3", imageUrl: "https://example.com/x.png" })], 30, 1.5),
  },
};
const idsOf = (levels: ExportableQuiz["levels"], name: Level) => (levels[name]?.questions ?? []).map((item) => item.id);

describe("export and import again", () => {
  it("JSON: exports with ids, validates, and importing it in place changes nothing", () => {
    const text = exportJson(sample);
    const parsed = parseQuizJson(text);
    expect(parsed.issues).toEqual([]);
    expect(parsed.settings).toMatchObject({ title: "Round trip", duration: 25, examMode: "strict", showAnswerReview: false });
    for (const name of ["easy", "hard"] as const) {
      const checked = checkRows(parsed.levels[name]!.rows);
      expect(checked.every((c) => c.status === "ok" || c.status === "warning")).toBe(true);
      const incoming = checked.map((c) => c.clean as EditorQuestion);
      const current = sample.levels[name]!.questions;
      const after = applyImport(current, incoming, "update");
      expect(diffQuestions(current, after)).toEqual({ added: 0, changed: 0, removed: 0, unchanged: current.length });
      expect(after.map((item) => item.id)).toEqual(idsOf(sample.levels, name));
    }
    expect(parsed.levels.hard).toMatchObject({ duration: 30, pointsMultiplier: 1.5 });
  });

  it("CSV: exports with ids, formula-safe cells and a byte order mark, and imports back to the same questions", () => {
    const csv = exportCsv(sample);
    expect(csv.startsWith("﻿id,level,type,question,option_a,")).toBe(true);
    expect(csv).toContain("'=SUM(A1)");
    const parsed = parseSpreadsheetText(csv);
    expect(parsed.issues).toEqual([]);
    for (const name of ["easy", "hard"] as const) {
      const incoming = checkRows(parsed.levels[name]!.rows).map((c) => c.clean as EditorQuestion);
      const current = sample.levels[name]!.questions;
      expect(incoming).toEqual(current.map((item) => ({ ...item, options: item.options.map((o) => ({ ...o, ...(o.rationale ? { rationale: o.rationale } : {}) })) })));
      expect(diffQuestions(current, applyImport(current, incoming, "update"))).toMatchObject({ added: 0, changed: 0, removed: 0 });
    }
  });

  it("text: exports a level the text reader reads back to the same questions (without ids)", () => {
    const text = exportText(sample);
    const parsed = parseQuizText(text);
    expect(parsed.issues).toEqual([]);
    expect(parsed.settings.title).toBe("Round trip");
    expect(parsed.levels.hard).toMatchObject({ duration: 30, pointsMultiplier: 1.5 });
    const back = checkRows(parsed.levels.easy!.rows).map((c) => c.clean);
    // Line breaks inside a cell become spaces in the text format.
    expect(back[0]?.options[2].rationale).toBe("Line one line two");
    expect(back.map((item) => item?.text)).toEqual(["First?", "Second, with a comma?"]);
    expect(back[1]?.type).toBe("multiple");
  });

  it("exports reasons columns only when some option has a reason", () => {
    const plain: ExportableQuiz = { ...sample, levels: { easy: level([{ type: "single", text: "Q", options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] }]) } };
    expect(exportCsv(plain)).not.toContain("a_why");
    expect(exportCsv(sample)).toContain("a_why");
  });

  it("round-trips the full example through the JSON export", () => {
    const parsed = parseQuizJson(JSON.stringify(FULL_EXAMPLE));
    const exportable: ExportableQuiz = {
      title: parsed.settings.title!,
      description: parsed.settings.description,
      duration: parsed.settings.duration!,
      examMode: parsed.settings.examMode!,
      showAnswerReview: parsed.settings.showAnswerReview!,
      levels: Object.fromEntries(
        (["easy", "hard"] as const).map((name) => [
          name,
          { ...parsed.levels[name]!, duration: parsed.levels[name]!.duration!, pointsMultiplier: parsed.levels[name]!.pointsMultiplier!, questions: parsed.levels[name]!.rows.map((r) => r.question) },
        ])
      ),
    };
    const again = parseQuizJson(exportJson(exportable));
    expect(again.issues).toEqual([]);
    expect(again.levels.easy!.rows.map((r) => r.question)).toEqual(parsed.levels.easy!.rows.map((r) => r.question));
  });
});

describe("what an import does to a level", () => {
  const stored = (n: number): EditorQuestion[] => Array.from({ length: n }, (_, i) => q(`Stored ${i}`, { id: `s${i}` }));

  it("add: new questions after the current ones, ids in the file ignored", () => {
    const after = applyImport(stored(2), [q("New", { id: "s0" })], "add");
    expect(after.map((item) => item.id)).toEqual(["s0", "s1", undefined]);
    expect(describeDiff(diffQuestions(stored(2), after))).toBe("1 new, 2 unchanged");
  });

  it("replace: the file becomes the level", () => {
    const current = stored(5);
    const after = applyImport(current, [q("Edited", { id: "s1" }), q("Brand new")], "replace");
    expect(diffQuestions(current, after)).toEqual({ added: 1, changed: 1, removed: 4, unchanged: 0 });
    expect(describeDiff(diffQuestions(current, after))).toBe("1 new, 1 changed, 4 removed");
  });

  it("update: ids in the file change in place, the rest of the file is added, nothing is removed", () => {
    const current = stored(4);
    const after = applyImport(current, [q("Edited", { id: "s2" }), q("Added")], "update");
    expect(after.map((item) => item.text)).toEqual(["Stored 0", "Stored 1", "Edited", "Stored 3", "Added"]);
    expect(diffQuestions(current, after)).toEqual({ added: 1, changed: 1, removed: 0, unchanged: 3 });
  });

  it("counts a moved question as changed, like the writes do", () => {
    const current = stored(2);
    const swapped = [current[1], current[0]];
    expect(diffQuestions(current, swapped)).toEqual({ added: 0, changed: 2, removed: 0, unchanged: 0 });
  });

  it("agrees with planQuestionWrites", () => {
    const current = stored(5);
    const after = applyImport(current, [q("Edited", { id: "s1" }), q("Brand new")], "replace");
    const existing = emptyExisting();
    existing.byLevel.easy = current.map((item, index) => ({ id: item.id as string, data: questionToDoc(item, index) as unknown as Record<string, unknown> }));
    let n = 0;
    const writes = planQuestionWrites({ easy: level(after) }, existing, () => `new${n++}`);
    const diff = diffQuestions(current, after);
    expect(writes.sets.length).toBe(diff.added + diff.changed);
    expect(writes.removes.length).toBe(diff.removed);
  });
});
