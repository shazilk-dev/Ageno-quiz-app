import { describe, expect, it } from "vitest";
import type { InsightQuestion } from "@/lib/item-analysis";
import { questionResultsCsv, type CsvResult } from "@/lib/question-results-csv";

const question = (id: string, label: string, correct: number[], options = 4): InsightQuestion => ({
  id,
  label,
  type: correct.length > 1 ? "multiple" : "single",
  options: Array.from({ length: options }, (_, i) => ({ text: `o${i}`, isCorrect: correct.includes(i) })),
});

const levels = [{ level: "easy", questions: [question("a", "First", [1]), question("b", "Second", [0, 2])] }];

const result = (over: Partial<CsvResult> = {}): CsvResult => ({
  id: "r1",
  player: "Ada",
  level: "easy",
  submittedAt: Date.UTC(2026, 9, 29, 12, 0),
  sheet: {},
  ...over,
});

/** The file as rows of cells: every cell is quoted, a quote inside is doubled, a comma inside is part of the cell. */
function table(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = csv.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") continue;
    else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

describe("question results CSV", () => {
  it("writes a row per person and question, with letters for the picks and the key", () => {
    const { csv, rows, truncated } = questionResultsCsv("Networking", levels, [
      result({ sheet: { a: { p: [1], ok: true }, b: { p: [0, 1], ok: false } } }),
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(rows).toBe(2);
    expect(truncated).toBe(false);
    const [header, first, second] = table(csv);
    expect(header).toEqual([
      "Quiz", "Level", "Result", "Player", "Submitted (UTC)", "Question no.", "Question", "Picked", "Correct answer", "Outcome",
    ]);
    expect(first).toEqual(["Networking", "easy", "r1", "Ada", "2026-10-29T12:00:00.000Z", "1", "First", "B", "B", "right"]);
    // A select-all question: the picks and the key are lists.
    expect(second.slice(5)).toEqual(["2", "Second", "A, B", "A, C", "wrong"]);
  });

  it("counts a question left out of the sheet as skipped, and an unrecorded one by the key as it is now", () => {
    const { csv } = questionResultsCsv("Q", levels, [result({ sheet: { b: { p: [0, 2] } } })]);
    const [, first, second] = table(csv);
    expect(first.slice(7)).toEqual(["", "B", "skipped"]);
    expect(second[9]).toBe("right");
  });

  it("says 'not marked' for a question with no key, and ignores picks outside the options", () => {
    const keyless = [{ level: "easy", questions: [question("k", "No key", [])] }];
    const marked = questionResultsCsv("Q", keyless, [result({ sheet: { k: { p: [1] } } })]);
    expect(table(marked.csv)[1].slice(7)).toEqual(["B", "", "not marked"]);
    const wild = questionResultsCsv("Q", levels, [result({ sheet: { a: { p: [9, -1, 1.5] } } })]);
    expect(table(wild.csv)[1].slice(7)).toEqual(["", "B", "skipped"]);
  });

  it("only uses the questions of the level the result was taken at", () => {
    const two = [...levels, { level: "hard", questions: [question("h", "Hard one", [0])] }];
    const { csv, rows } = questionResultsCsv("Q", two, [result({ level: "hard" }), result({ id: "r2", level: "gone" })]);
    expect(rows).toBe(1);
    expect(table(csv)[1][6]).toBe("Hard one");
  });

  it("stops at the row limit and says so", () => {
    const many = Array.from({ length: 5 }, (_, i) => result({ id: `r${i}` }));
    const cut = questionResultsCsv("Q", levels, many, 3);
    expect(cut).toMatchObject({ rows: 3, truncated: true });
    expect(table(cut.csv)).toHaveLength(4);
    const whole = questionResultsCsv("Q", levels, many, 10);
    expect(whole).toMatchObject({ rows: 10, truncated: false });
  });

  it("keeps a spreadsheet from running a name or question as a formula, and quotes commas", () => {
    const risky = [{ level: "easy", questions: [question("a", '=HYPERLINK("x")', [1])] }];
    const { csv } = questionResultsCsv("+Quiz", risky, [result({ player: "@Eve, Jr." })]);
    expect(csv).toContain('"\'+Quiz"');
    expect(csv).toContain('"\'@Eve, Jr."');
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
  });

  it("gives just the header when there are no results", () => {
    const { csv, rows } = questionResultsCsv("Q", levels, []);
    expect(rows).toBe(0);
    expect(table(csv)).toHaveLength(1);
  });
});
