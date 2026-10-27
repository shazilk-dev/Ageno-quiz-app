// @vitest-environment jsdom
// The pure parts of the editor's speed tools (A3): the checks, the grid's paste and cell rules, and the
// draft kept on the device.
//   npx vitest run __tests__/quiz-editor-tools.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, draftKey, formFromStored, loadDraft, saveDraft } from "@/components/admin/quiz-editor/draft-storage";
import { blankForm, draftQuestion, type DraftQuestion } from "@/components/admin/quiz-editor/editor-state";
import {
  cloneAsNew,
  correctLetters,
  isBlockOfCells,
  optionColumnsFor,
  pasteIntoGrid,
  setCell,
  setCorrectFromText,
} from "@/components/admin/quiz-editor/grid";
import { checkQuiz, type LevelForChecks } from "@/lib/quiz-checks";
import { duplicateInput } from "@/lib/quiz-duplicate";
import { validateQuizInput, type AdminQuizDetail, type EditorQuestion, type Level } from "@/lib/quiz-schema";

const q = (text: string, options: string[], right: number[] = [0], extra: Partial<EditorQuestion> = {}): EditorQuestion => ({
  type: right.length > 1 ? "multiple" : "single",
  text,
  options: options.map((option, i) => ({ text: option, isCorrect: right.includes(i) })),
  ...extra,
});

const levels = (partial: Partial<Record<Level, LevelForChecks>> = {}): Record<Level, LevelForChecks> => ({
  easy: { duration: 30, questions: [] },
  medium: { duration: 30, questions: [] },
  hard: { duration: 30, questions: [] },
  ...partial,
});

const codes = (checks: ReturnType<typeof checkQuiz>) => checks.map((check) => check.code);

describe("checkQuiz", () => {
  it("finds nothing in a tidy quiz", () => {
    const tidy = Array.from({ length: 4 }, (_, i) => q(`Question ${i}?`, ["a", "b", "c", "d"], [i % 4], { explanation: "Because." }));
    expect(checkQuiz(levels({ easy: { duration: 30, questions: tidy } }))).toEqual([]);
  });

  it("flags a repeated question, even in another level, and says where the first one is", () => {
    const checks = checkQuiz(
      levels({
        easy: { duration: 30, questions: [q("What is 2 + 2?", ["4", "5"], [0], { explanation: "x" })] },
        hard: { duration: 30, questions: [q("what is 2+2", ["four", "five"], [0], { explanation: "x" })] },
      })
    );
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ code: "duplicate-question", level: "hard", questions: [0] });
    expect(checks[0].message).toBe("Same question as Easy · Question 1.");
  });

  it("flags repeated options, 'all of the above', and select-all with everything right", () => {
    const checks = checkQuiz(
      levels({
        easy: {
          duration: 30,
          questions: [
            q("One?", ["Red", "red.", "Blue", "Green"], [0], { explanation: "x" }),
            q("Two?", ["a", "b", "All of the above"], [2], { explanation: "x" }),
            q("Three?", ["a", "b"], [0, 1], { explanation: "x" }),
          ],
        },
      })
    );
    expect(codes(checks)).toEqual(["duplicate-options", "none-or-all", "all-correct"]);
    expect(checks[0].message).toBe("Options A and B say the same thing.");
  });

  it("notes a select-all question with a single right option", () => {
    const checks = checkQuiz(
      levels({ easy: { duration: 30, questions: [q("Pick?", ["a", "b", "c"], [1], { type: "multiple", explanation: "x" })] } })
    );
    expect(codes(checks)).toEqual(["multiple-one-right"]);
  });

  it("flags a right answer that sits in one place, only once there are enough questions to mean it", () => {
    const make = (count: number, position: number) =>
      Array.from({ length: count }, (_, i) => q(`Q${i}?`, ["a", "b", "c", "d"], [i < count - 1 ? position : 0], { explanation: "x" }));
    expect(codes(checkQuiz(levels({ easy: { duration: 30, questions: make(5, 2) } })))).toEqual([]);
    const checks = checkQuiz(levels({ easy: { duration: 30, questions: make(10, 2) } }));
    expect(codes(checks)).toEqual(["answer-position"]);
    expect(checks[0].message).toContain("9 of 10");
    expect(checks[0].message).toContain("option C");
  });

  it("flags 'the longest option is right' when it is true most of the time", () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      q(`Q${i}?`, ["short", "a much longer and more detailed option", "tiny", "meh"], [1], { explanation: "x" })
    ).map((question, i) => (i % 4 === 0 ? { ...question, options: question.options.map((o, j) => ({ ...o, isCorrect: j === 0 })) } : question));
    const hit = checkQuiz(levels({ easy: { duration: 30, questions } })).find((check) => check.code === "longest-is-right");
    expect(hit?.message).toContain("7 of 10");
  });

  it("lists the questions that have no explanation and no option reason, as one entry for the level", () => {
    const checks = checkQuiz(
      levels({
        easy: {
          duration: 30,
          questions: [
            q("A?", ["a", "b"]),
            q("B?", ["a", "b"], [0], { explanation: "Because." }),
            { ...q("C?", ["a", "b"]), options: [{ text: "a", isCorrect: true, rationale: "Yes." }, { text: "b", isCorrect: false }] },
            q("D?", ["a", "b"]),
          ],
        },
      })
    );
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ code: "no-explanation", questions: [0, 3] });
    expect(checks[0].message).toBe("2 questions have no explanation and no reason on any option, so the review can only say right or wrong.");
  });

  it("warns when the time limit leaves seconds per question", () => {
    const questions = Array.from({ length: 30 }, (_, i) => q(`Q${i}?`, ["a", "b"], [i % 2], { explanation: "x" }));
    const checks = checkQuiz(levels({ easy: { duration: 5, questions } }));
    expect(checks.find((check) => check.code === "tight-time")?.message).toBe("30 questions in 5 minutes is 10 seconds each.");
    // An empty time box (NaN) is the form's problem, not this one's.
    expect(codes(checkQuiz(levels({ easy: { duration: Number.NaN, questions } })))).not.toContain("tight-time");
  });
});

const draft = (question: EditorQuestion, key = "k"): DraftQuestion => ({ ...question, key });

describe("the grid's cells", () => {
  it("sets the question or an option, adding blank options when a cell past the end is filled", () => {
    const base = draft(q("Q?", ["a", "b"]));
    expect(setCell(base, 0, "New?").text).toBe("New?");
    const wider = setCell(base, 4, "d");
    expect(wider.options.map((option) => option.text)).toEqual(["a", "b", "", "d"]);
    expect(base.options).toHaveLength(2); // the original is untouched
  });

  it("shows the right options as letters", () => {
    expect(correctLetters(draft(q("Q?", ["a", "b", "c"], [0, 2])))).toBe("A, C");
    expect(correctLetters(draft(q("Q?", ["a", "b", "c"], [])))).toBe("");
  });

  it("reads the correct column: a letter, several letters (which make it select-all), the option's text", () => {
    const base = draft(q("Q?", ["red", "green", "blue"], [0]));
    expect(correctLetters(setCorrectFromText(base, "C").question)).toBe("C");
    const many = setCorrectFromText(base, "a, c").question;
    expect(many.type).toBe("multiple");
    expect(correctLetters(many)).toBe("A, C");
    expect(correctLetters(setCorrectFromText(base, "green").question)).toBe("B");
  });

  it("refuses text it can't read and changes nothing; a blank cell changes nothing either", () => {
    const base = draft(q("Q?", ["a", "b"], [0]));
    const bad = setCorrectFromText(base, "F");
    expect(bad.problem).toMatch(/option F/);
    expect(bad.question).toBe(base);
    expect(setCorrectFromText(base, "  ")).toEqual({ question: base });
  });

  it("makes a copy that is a new question", () => {
    const original = draft({ ...q("Q?", ["a", "b"]), id: "stored-1" }, "old");
    const copy = cloneAsNew(original, "fresh");
    expect(copy.id).toBeUndefined();
    expect(copy.key).toBe("fresh");
    copy.options[0].text = "changed";
    expect(original.options[0].text).toBe("a");
  });

  it("starts with four option columns and widens to the widest question", () => {
    expect(optionColumnsFor([])).toBe(4);
    expect(optionColumnsFor([draft(q("Q?", ["a", "b"]))])).toBe(4);
    expect(optionColumnsFor([draft(q("Q?", ["a", "b", "c", "d", "e", "f"]))])).toBe(6);
  });
});

describe("pasting into the grid", () => {
  let counter = 0;
  const makeKey = () => `new-${++counter}`;
  beforeEach(() => {
    counter = 0;
  });

  const rows = (...lines: string[][]) => lines.map((line) => line.join("\t")).join("\n") + "\n";

  it("tells a block of cells from a single value", () => {
    expect(isBlockOfCells("just some text")).toBe(false);
    expect(isBlockOfCells("one line\n")).toBe(false);
    expect(isBlockOfCells("a\tb")).toBe(true);
    expect(isBlockOfCells("a\nb")).toBe(true);
  });

  it("fills rows from the cell it lands in, adds rows at the end and reads the correct column", () => {
    const existing = [draft(q("Old?", ["a", "b", "c", "d"]), "k1")];
    const result = pasteIntoGrid(
      existing,
      4,
      { row: 0, column: 0 },
      rows(["Capital of France?", "Paris", "Rome", "Oslo", "Bern", "A"], ["Two primes?", "2", "4", "3", "6", "A, C"]),
      makeKey
    );
    expect(result.added).toBe(1);
    expect(result.ignored).toBe(0);
    expect(result.questions).toHaveLength(2);
    const [first, second] = result.questions;
    expect(first).toMatchObject({ key: "k1", text: "Capital of France?" });
    expect(first.options.map((o) => o.text)).toEqual(["Paris", "Rome", "Oslo", "Bern"]);
    expect(correctLetters(first)).toBe("A");
    expect(second.key).toBe("new-1");
    expect(second.type).toBe("multiple");
    expect(correctLetters(second)).toBe("A, C");
    expect(existing[0].text).toBe("Old?"); // the input list is not changed
  });

  it("pastes into the middle of a row without touching the cells to its left", () => {
    const existing = [draft(q("Keep me", ["a", "b", "c", "d"], [1]), "k1"), draft(q("Second", ["w", "x", "y", "z"], [2]), "k2")];
    const result = pasteIntoGrid(existing, 4, { row: 0, column: 2 }, rows(["B1", "C1"], ["B2", "C2"]), makeKey);
    expect(result.questions[0].text).toBe("Keep me");
    expect(result.questions[0].options.map((o) => o.text)).toEqual(["a", "B1", "C1", "d"]);
    expect(result.questions[1].options.map((o) => o.text)).toEqual(["w", "B2", "C2", "z"]);
    expect(correctLetters(result.questions[0])).toBe("B");
  });

  it("counts what didn't fit: columns past the last, and a correct answer that can't be read", () => {
    const result = pasteIntoGrid(
      [draft(q("Q?", ["a", "b", "c", "d"]), "k1")],
      4,
      { row: 0, column: 0 },
      rows(["New?", "1", "2", "3", "4", "Z", "extra"]),
      makeKey
    );
    expect(result.ignored).toBe(2);
    expect(result.questions[0].text).toBe("New?");
    expect(correctLetters(result.questions[0])).toBe("A"); // unchanged
  });

  it("matches the columns by name when the block has a header row, wherever they sit", () => {
    const result = pasteIntoGrid(
      [],
      4,
      { row: 0, column: 3 },
      rows(["Correct", "Option B", "Question", "Option A", "Option E"], ["B", "no", "Pick?", "yes", "maybe"]),
      makeKey
    );
    expect(result.usedHeader).toBe(true);
    expect(result.optionColumns).toBe(5);
    expect(result.questions).toHaveLength(1);
    const [only] = result.questions;
    expect(only.text).toBe("Pick?");
    expect(only.options.map((o) => o.text)).toEqual(["yes", "no", "", "", "maybe"]);
    expect(correctLetters(only)).toBe("B");
  });

  it("ignores empty trailing rows and quoted cells with line breaks stay in one cell", () => {
    const text = 'Line one\tA\tB\n"Two\nlines"\tC\tD\n\t\t\n';
    const result = pasteIntoGrid([], 4, { row: 0, column: 0 }, text, makeKey);
    expect(result.questions).toHaveLength(2);
    expect(result.questions[1].text).toBe("Two\nlines");
  });
});

describe("the draft kept on the device", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  const filled = () => {
    const form = blankForm();
    form.title = "Networks";
    form.levels.easy.questions = [draftQuestion(q("What is DNS?", ["Names", "Mail"], [0], { explanation: "Phone book." }))];
    return form;
  };

  it("keeps the form and brings it back without its React keys", () => {
    expect(saveDraft("quiz1", filled(), 1234, 99)).toBe(true);
    const stored = JSON.parse(window.localStorage.getItem(draftKey("quiz1"))!);
    expect(stored.form.levels.easy.questions[0].key).toBeUndefined();

    const back = loadDraft("quiz1");
    expect(back).toMatchObject({ savedAt: 99, baseVersion: 1234 });
    expect(back!.form.title).toBe("Networks");
    expect(back!.form.levels.easy.questions[0]).toMatchObject({ text: "What is DNS?", explanation: "Phone book." });
    expect(back!.form.levels.easy.questions[0].key).toMatch(/^draft-/);
  });

  it("keeps a new quiz's draft apart from every stored quiz's", () => {
    saveDraft(null, filled(), 0);
    expect(draftKey(null)).toBe("ageno:admin:draft:new");
    expect(loadDraft("quiz1")).toBeNull();
    expect(loadDraft(null)).not.toBeNull();
    clearDraft(null);
    expect(loadDraft(null)).toBeNull();
  });

  it("never throws on a damaged or foreign value", () => {
    for (const value of ["not json", "{}", '{"v":2,"form":{}}', '{"v":1,"form":"x"}', "null", "[1]"]) {
      window.localStorage.setItem(draftKey("q"), value);
      expect(loadDraft("q")).toBeNull();
    }
    expect(formFromStored(undefined)).toBeNull();
  });

  it("repairs a half-readable form instead of refusing it", () => {
    const form = formFromStored({
      title: 5,
      levels: { easy: { questions: [{ text: "ok", options: [{ text: "a", isCorrect: true }, "junk"], type: "weird" }, { options: [] }, 7] } },
    });
    expect(form!.title).toBe("");
    expect(form!.levels.easy.questions).toHaveLength(1);
    expect(form!.levels.easy.questions[0]).toMatchObject({ type: "single", text: "ok" });
    expect(form!.levels.easy.questions[0].options).toHaveLength(1);
  });

  it("reports false when the browser refuses to store it, and null when it can't read", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveDraft("q", filled(), 1)).toBe(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadDraft("q")).toBeNull();
  });
});

describe("duplicateInput", () => {
  const quiz: AdminQuizDetail = {
    id: "orig",
    version: 77,
    createdAt: 1,
    createdBy: "root",
    responseCount: 40,
    updateUnfinished: true,
    title: "Networking",
    description: "About it",
    duration: 20,
    accessCode: "ABC123",
    requiresAccessCode: true,
    isPublic: false,
    active: true,
    isAutoCheck: true,
    showAnswerReview: false,
    examMode: "strict",
    levels: {
      easy: { duration: 10, pointsMultiplier: 1, questions: [{ ...q("One?", ["a", "b"], [0], { explanation: "Because." }), id: "q1" }] },
      hard: { duration: 5, pointsMultiplier: 2, questions: [] },
    },
  };

  it("keeps the settings and questions, drops what belongs to the original, and starts closed", () => {
    const copy = duplicateInput(quiz);
    expect(copy).toMatchObject({
      title: "Copy of Networking",
      description: "About it",
      accessCode: "",
      requiresAccessCode: true,
      isPublic: false,
      active: false,
      showAnswerReview: false,
      examMode: "strict",
      duration: 20,
    });
    for (const gone of ["id", "version", "createdAt", "createdBy", "responseCount", "updateUnfinished"]) {
      expect(copy).not.toHaveProperty(gone);
    }
    expect(Object.keys(copy.levels)).toEqual(["easy"]); // an empty level is left out
    expect(copy.levels.easy!.questions[0]).toEqual(q("One?", ["a", "b"], [0], { explanation: "Because." }));
    expect(validateQuizInput(copy).ok).toBe(true);
  });

  it("copies the options rather than sharing them, and keeps a long title within the limit", () => {
    const copy = duplicateInput({ ...quiz, title: "x".repeat(200) });
    expect(copy.title.length).toBeLessThanOrEqual(200);
    copy.levels.easy!.questions[0].options[0].text = "changed";
    expect(quiz.levels.easy!.questions[0].options[0].text).toBe("a");
  });
});
