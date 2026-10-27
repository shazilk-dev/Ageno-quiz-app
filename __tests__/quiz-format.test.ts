// Unit tests for Ageno Quiz Format: the JSON reader, the row checks, the whole-file validator, and the
// contract between the JSON Schema and the app's own rules. Pure code: no Firebase, no emulator.
//   npx vitest run __tests__/quiz-format.test.ts
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { checkRows, summarize } from "@/lib/quiz-format/checks";
import { FULL_EXAMPLE, MINIMAL_EXAMPLE } from "@/lib/quiz-format/examples";
import { buildJsonSchema } from "@/lib/quiz-format/json-schema";
import { parseQuizJson, readQuizValue } from "@/lib/quiz-format/read";
import { allRows } from "@/lib/quiz-format/types";
import { validateQuizFile } from "@/lib/quiz-format/validate";
import { LIMITS } from "@/lib/quiz-schema";

const opt = (text: string, isCorrect = false, rationale?: string) => ({
  text,
  isCorrect,
  ...(rationale ? { rationale } : {}),
});
const q = (text: string, extra: Record<string, unknown> = {}) => ({
  text,
  options: [opt("A"), opt("B", true), opt("C")],
  ...extra,
});
const file = (levels: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  format: "ageno-quiz",
  version: 1,
  levels,
  ...extra,
});
const errorsOf = (parsed: ReturnType<typeof readQuizValue>) =>
  parsed.issues.filter((i) => i.severity === "error").map((i) => i.message);

describe("reading a quiz file", () => {
  it("reads the envelope: settings, level settings and questions", () => {
    const parsed = readQuizValue(FULL_EXAMPLE);
    expect(parsed.shape).toBe("quiz");
    expect(parsed.issues).toEqual([]);
    expect(parsed.settings).toEqual({
      title: "Network basics",
      description: "Protocols, ports and addressing.",
      duration: 20,
      examMode: "practice",
      showAnswerReview: true,
    });
    expect(parsed.levels.easy).toMatchObject({ duration: 15, pointsMultiplier: 1 });
    expect(parsed.levels.hard?.pointsMultiplier).toBe(1.5);
    expect(parsed.levels.easy?.rows).toHaveLength(2);
    expect(parsed.levels.easy?.rows[0].source).toBe("Easy · question 1");
    expect(parsed.levels.medium).toBeUndefined();
  });

  it("keeps the AI's note on the row but not on the question", () => {
    const row = readQuizValue(FULL_EXAMPLE).levels.easy!.rows[1];
    expect(row.note).toMatch(/RFC 1918/);
    expect(row.question).not.toHaveProperty("note");
  });

  it("reads a bare list of questions and a single level", () => {
    const list = readQuizValue([q("One"), q("Two")]);
    expect(list.shape).toBe("questions");
    expect(list.unplaced.map((r) => r.question.text)).toEqual(["One", "Two"]);
    expect(list.unplaced[1].source).toBe("Question 2");

    const level = readQuizValue({ level: "hard", duration: 30, questions: [q("One")] });
    expect(level.shape).toBe("level");
    expect(level.levels.hard).toMatchObject({ duration: 30 });
    expect(level.levels.hard?.rows).toHaveLength(1);

    const unnamed = readQuizValue({ questions: [q("One")] });
    expect(unnamed.unplaced).toHaveLength(1);
  });

  it("infers the type from the correct options and keeps a stated one", () => {
    const rows = allRows(
      readQuizValue(
        file({
          easy: {
            questions: [
              q("one correct"),
              q("two correct", { options: [opt("A", true), opt("B", true), opt("C")] }),
              q("stated multiple, one correct", { type: "multiple" }),
              q("stated single, two correct", { type: "single", options: [opt("A", true), opt("B", true)] }),
            ],
          },
        })
      )
    );
    expect(rows.map((r) => r.question.type)).toEqual(["single", "multiple", "multiple", "single"]);
  });

  it("reports a type that disagrees with the correct options as an error on that row", () => {
    const parsed = readQuizValue(
      file({ easy: { questions: [q("Q", { type: "single", options: [opt("A", true), opt("B", true)] })] } })
    );
    const [checked] = checkRows(allRows(parsed));
    expect(checked.status).toBe("error");
    expect(checked.issues.map((i) => i.message).join(" ")).toMatch(/single-answer question has one correct option/);
  });

  it("reads older exports: plain-text options with a correctIndex, and ignores database leftovers quietly", () => {
    const parsed = readQuizValue([{ text: "Q", options: ["a", "b", "c"], correctIndex: 2, points: 1, order: 3 }]);
    const [row] = parsed.unplaced;
    expect(row.question.options.map((o) => o.isCorrect)).toEqual([false, false, true]);
    expect(row.issues).toEqual([]);
  });

  it("warns about fields the format doesn't have, without refusing the question", () => {
    const parsed = readQuizValue(
      file({ easy: { questions: [q("Q", { hint: "x", options: [{ text: "A", isCorrect: true, colour: "red" }, opt("B")] })] } })
    );
    const [row] = parsed.levels.easy!.rows;
    expect(row.issues.map((i) => i.severity)).toEqual(["warning", "warning"]);
    expect(row.issues[0].message).toBe('"hint" is not part of the format and was ignored.');
    expect(row.issues[1].message).toBe('option 1: "colour" is not part of the format and was ignored.');
  });

  it("lets one bad question through to its own row and still reads the others", () => {
    const parsed = readQuizValue(file({ easy: { questions: [q("Fine"), "nonsense", q("Also fine")] } }));
    expect(errorsOf(parsed)).toEqual([]);
    const checked = checkRows(allRows(parsed));
    expect(checked.map((c) => c.status)).toEqual(["ok", "error", "ok"]);
    expect(summarize(checked).text).toBe("3 questions: 2 ready, 1 needs fixing (Easy · question 2)");
  });

  it("refuses a file made with a newer version, and says which versions this app reads", () => {
    const parsed = readQuizValue({ ...MINIMAL_EXAMPLE, version: 2 });
    expect(errorsOf(parsed)[0]).toMatch(/version 2.*newer.*version 1/);
  });

  it("refuses the wrong format name or a nonsense version", () => {
    expect(errorsOf(readQuizValue({ ...MINIMAL_EXAMPLE, format: "other" }))[0]).toMatch(/"format" must be "ageno-quiz"/);
    expect(errorsOf(readQuizValue({ ...MINIMAL_EXAMPLE, version: "1" }))[0]).toMatch(/"version" must be a whole number/);
    expect(errorsOf(readQuizValue({ ...MINIMAL_EXAMPLE, version: 0 }))[0]).toMatch(/"version" must be a whole number/);
  });

  it("reads a file without a version as version 1, with a warning", () => {
    const parsed = readQuizValue({ levels: MINIMAL_EXAMPLE.levels });
    expect(errorsOf(parsed)).toEqual([]);
    expect(parsed.issues[0].message).toMatch(/No "version"/);
  });

  it("names a level that doesn't exist and settings that are out of range", () => {
    const parsed = readQuizValue(
      file({ expert: { questions: [] }, easy: { duration: 0, pointsMultiplier: 9, questions: [q("Q")] } }, { quiz: { duration: 1000, examMode: "loud" } })
    );
    const errors = errorsOf(parsed).join("\n");
    expect(errors).toMatch(/"expert" is not a level/);
    expect(errors).toMatch(/Easy: "duration"/);
    expect(errors).toMatch(/Easy: "pointsMultiplier"/);
    expect(errors).toMatch(/"quiz.duration"/);
    expect(errors).toMatch(/"quiz.examMode"/);
  });

  it("has things to say about files that aren't quizzes", () => {
    expect(errorsOf(readQuizValue("hello"))[0]).toMatch(/Expected a quiz/);
    expect(errorsOf(readQuizValue([]))[0]).toMatch(/no questions/);
    expect(errorsOf(readQuizValue({ format: "ageno-quiz", version: 1 }))[0]).toMatch(/Add "levels"/);
    expect(errorsOf(readQuizValue(file({ easy: { questions: [] } })))[0]).toMatch(/no questions/);
  });
});

describe("reading JSON text", () => {
  it("strips a byte order mark", () => {
    const parsed = parseQuizJson("﻿" + JSON.stringify(MINIMAL_EXAMPLE));
    expect(parsed.issues).toEqual([]);
    expect(parsed.levels.easy?.rows).toHaveLength(1);
  });

  it("says where JSON goes wrong", () => {
    const parsed = parseQuizJson('{\n  "format": "ageno-quiz",\n  "version": 1,,\n}');
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0].message).toMatch(/isn't valid JSON \(near line 3, column \d+\)/);
  });

  it("copes with an empty paste and an oversized one", () => {
    expect(parseQuizJson("  \n ").issues[0].message).toBe("The file is empty.");
    expect(parseQuizJson("x".repeat(5_000_001)).issues[0].message).toMatch(/more than 5 MB/);
  });
});

describe("checking rows", () => {
  const rowsOf = (...questions: unknown[]) => allRows(readQuizValue(questions));

  it("marks a clean row ok and returns the cleaned question", () => {
    const [checked] = checkRows(rowsOf(q("  Padded  ")));
    expect(checked.status).toBe("ok");
    expect(checked.clean?.text).toBe("Padded");
  });

  it("uses the schema's own messages for errors, and withholds the question", () => {
    const [empty, none] = checkRows(rowsOf(q(""), q("No key", { options: [opt("A"), opt("B")] })));
    expect(empty.status).toBe("error");
    expect(empty.clean).toBeNull();
    expect(empty.issues[0].message).toBe("write the question.");
    expect(none.issues.map((i) => i.message)).toContain("pick the correct answer.");
  });

  it("warns, without blocking, about duplicates in the file and against the level", () => {
    const rows = rowsOf(q("What is 2 + 2?"), q("what is 2+2"), q("Something else"));
    const checked = checkRows(rows, { existing: [{ type: "single", text: "Something  else!", options: [] }] });
    expect(checked.map((c) => c.status)).toEqual(["ok", "warning", "warning"]);
    expect(checked[1].issues[0].message).toBe("the same question as question 1.");
    expect(checked[2].issues[0].message).toBe("this question is already in the level.");
    expect(checked[1].clean).not.toBeNull();
  });

  it("does not call a question a duplicate of itself when the file updates it by id", () => {
    const existing = [{ id: "abc", type: "single" as const, text: "Same", options: [] }];
    const [checked] = checkRows(rowsOf(q("Same", { id: "abc" })), { existing });
    expect(checked.status).toBe("ok");
  });

  it("warns about the AI's note, a select-all question where everything is right, long options and 'all of the above'", () => {
    const rows = rowsOf(
      q("Noted", { note: "I guessed." }),
      q("All right", { type: "multiple", options: [opt("A", true), opt("B", true)] }),
      q("Long", { options: [opt("x".repeat(301)), opt("B", true)] }),
      q("Lazy", { options: [opt("A"), opt("All of the above", true)] })
    );
    const messages = checkRows(rows).map((c) => c.issues.map((i) => i.message).join("|"));
    expect(messages[0]).toBe("note: I guessed.");
    expect(messages[1]).toBe("every option is marked correct.");
    expect(messages[2]).toBe("option 1 is very long (301 characters).");
    expect(messages[3]).toMatch(/option 2 is "All of the above"/);
  });

  it("summarises in one line", () => {
    expect(summarize([]).text).toBe("No questions found.");
    expect(summarize(checkRows(rowsOf(q("A"), q("B")))).text).toBe("2 questions: all ready");
    expect(summarize(checkRows(rowsOf(q("A"), q("A")))).text).toBe("2 questions: all ready, 1 with a warning");
    const bad = checkRows(rowsOf(q(""), q("fine"), q(""), q(""), q(""), q(""), q("")));
    expect(summarize(bad).text).toBe(
      "7 questions: 1 ready, 6 need fixing (Question 1, Question 3, Question 4, Question 5, Question 6 and 1 more)"
    );
  });
});

describe("validating a whole file", () => {
  it("passes the examples", () => {
    for (const example of [MINIMAL_EXAMPLE, FULL_EXAMPLE]) {
      const report = validateQuizFile(JSON.stringify(example));
      expect(report.errors).toEqual([]);
      expect(report.ok).toBe(true);
    }
    expect(validateQuizFile(JSON.stringify(FULL_EXAMPLE))).toMatchObject({
      counts: { easy: 2, hard: 1 },
      summary: "3 questions: all ready, 1 with a warning",
    });
  });

  it("lists every problem with its place", () => {
    const report = validateQuizFile(
      JSON.stringify(file({ easy: { questions: [q("Fine"), q(""), q("Two right", { type: "single", options: [opt("A", true), opt("B", true)] })] } }))
    );
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([
      "Easy · question 2: write the question.",
      "Easy · question 3: a single-answer question has one correct option. Untick the others, or make it select-all.",
    ]);
    expect(report.summary).toBe("3 questions: 1 ready, 2 need fixing (Easy · question 2, Easy · question 3)");
  });

  it("enforces the per-level limits the schema can't express", () => {
    const many = Array.from({ length: LIMITS.maxQuestionsPerLevel + 1 }, (_, i) => q(`Question ${i}`));
    expect(validateQuizFile(JSON.stringify(file({ easy: { questions: many } }))).errors[0]).toMatch(/more than the 400/);

    const fat = Array.from({ length: 160 }, (_, i) => q(`Question ${i}`, { explanation: "e".repeat(LIMITS.explanation) }));
    expect(validateQuizFile(JSON.stringify(file({ medium: { questions: fat } }))).errors[0]).toMatch(/too much text/);
  });

  it("asks for a title only as a warning", () => {
    const report = validateQuizFile(JSON.stringify(MINIMAL_EXAMPLE));
    expect(report.ok).toBe(true);
    expect(report.warnings[0]).toMatch(/no "quiz.title"/);
  });
});

// The schema is what an AI (or an editor with JSON Schema support) checks against, the reader is what the
// app runs. Each case says what each of them does; a rule changed on one side shows up here.
describe("the JSON Schema and the app agree", () => {
  const ajv = new Ajv2020({ allErrors: true });
  const schema = ajv.compile(buildJsonSchema());
  const longText = (n: number) => "x".repeat(n);

  type Verdict = "ok" | "warning" | "error";
  const cases: [string, unknown, boolean, Verdict][] = [
    // name, document, schema accepts, app verdict (error / warning / ok)
    ["minimal example", MINIMAL_EXAMPLE, true, "ok"],
    ["full example", FULL_EXAMPLE, true, "warning"], // the AI note
    ["no questions property", file({ easy: {} }), false, "error"],
    ["wrong format name", { ...MINIMAL_EXAMPLE, format: "x" }, false, "error"],
    ["newer version", { ...MINIMAL_EXAMPLE, version: 2 }, false, "error"],
    ["no levels", { format: "ageno-quiz", version: 1 }, false, "error"],
    ["unknown level", file({ expert: { questions: [q("Q")] } }), false, "error"],
    ["blank question text", file({ easy: { questions: [q("   ")] } }), false, "error"],
    ["question text at the limit", file({ easy: { questions: [q(longText(LIMITS.questionText))] } }), true, "ok"],
    ["question text over the limit", file({ easy: { questions: [q(longText(LIMITS.questionText + 1))] } }), false, "error"],
    ["one option", file({ easy: { questions: [q("Q", { options: [opt("A", true)] })] } }), false, "error"],
    ["eleven options", file({ easy: { questions: [q("Q", { options: Array.from({ length: 11 }, (_, i) => opt(`o${i}`, i === 0)) })] } }), false, "error"],
    ["ten options", file({ easy: { questions: [q("Q", { options: Array.from({ length: 10 }, (_, i) => opt(`o${i}`, i === 0)) })] } }), true, "ok"],
    ["blank option", file({ easy: { questions: [q("Q", { options: [opt("A", true), opt(" ")] })] } }), false, "error"],
    ["no correct option", file({ easy: { questions: [q("Q", { options: [opt("A"), opt("B")] })] } }), false, "error"],
    ["two correct, no type", file({ easy: { questions: [q("Q", { options: [opt("A", true), opt("B", true), opt("C")] })] } }), true, "ok"],
    ["two correct, multiple", file({ easy: { questions: [q("Q", { type: "multiple", options: [opt("A", true), opt("B", true), opt("C")] })] } }), true, "ok"],
    ["two correct, single", file({ easy: { questions: [q("Q", { type: "single", options: [opt("A", true), opt("B", true)] })] } }), false, "error"],
    ["multiple with one correct", file({ easy: { questions: [q("Q", { type: "multiple" })] } }), true, "ok"],
    ["unknown type", file({ easy: { questions: [q("Q", { type: "essay" })] } }), false, "error"],
    ["every option correct", file({ easy: { questions: [q("Q", { type: "multiple", options: [opt("A", true), opt("B", true)] })] } }), true, "warning"],
    ["reason too long", file({ easy: { questions: [q("Q", { options: [opt("A", true, longText(LIMITS.rationale + 1)), opt("B")] })] } }), false, "error"],
    ["explanation too long", file({ easy: { questions: [q("Q", { explanation: longText(LIMITS.explanation + 1) })] } }), false, "error"],
    ["https image", file({ easy: { questions: [q("Q", { imageUrl: "https://example.com/a.png" })] } }), true, "ok"],
    ["http image", file({ easy: { questions: [q("Q", { imageUrl: "http://example.com/a.png" })] } }), false, "error"],
    ["bad question id", file({ easy: { questions: [q("Q", { id: "has space" })] } }), false, "error"],
    ["good question id", file({ easy: { questions: [q("Q", { id: "ab_12-C" })] } }), true, "ok"],
    ["time limit 0", file({ easy: { duration: 0, questions: [q("Q")] } }), false, "error"],
    ["time limit 600", file({ easy: { duration: 600, questions: [q("Q")] } }), true, "ok"],
    ["fractional time limit", file({ easy: { duration: 1.5, questions: [q("Q")] } }), false, "error"],
    ["multiplier 0.5", file({ easy: { pointsMultiplier: 0.5, questions: [q("Q")] } }), false, "error"],
    ["multiplier 5", file({ easy: { pointsMultiplier: 5, questions: [q("Q")] } }), true, "ok"],
    ["too many questions", file({ easy: { questions: Array.from({ length: 401 }, (_, i) => q(`Q${i}`)) } }), false, "error"],
    ["bad exam mode", file({ easy: { questions: [q("Q")] } }, { quiz: { examMode: "loud" } }), false, "error"],
    ["unknown field on a question", file({ easy: { questions: [q("Q", { hint: "x" })] } }), false, "warning"],
  ];

  it.each(cases)("%s", (_name, doc, schemaAccepts, verdict) => {
    expect(schema(doc)).toBe(schemaAccepts);
    const report = validateQuizFile(JSON.stringify(doc));
    const seen: Verdict = !report.ok ? "error" : report.warnings.some((w) => !/no "quiz.title"/.test(w)) ? "warning" : "ok";
    expect(seen).toBe(verdict);
  });

  it("never accepts, as a schema, what the app refuses", () => {
    for (const [name, doc, schemaAccepts, verdict] of cases) {
      if (schemaAccepts) expect(verdict, name).not.toBe("error");
    }
  });
});
