// Unit tests for the quiz schema (validation, stored shape, legacy handling, import/export) and the write
// planner. Pure code: no Firebase, no emulator.
//   npx vitest run __tests__/quiz-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  LIMITS,
  blankQuestion,
  exportQuestions,
  makeAccessCode,
  parseImportedQuestions,
  planLegacyQuestions,
  questionFromStored,
  questionToDoc,
  sortQuestionDocs,
  validateQuizInput,
  type EditorQuestion,
  type Level,
} from "@/lib/quiz-schema";
import { emptyExisting, planQuestionWrites } from "@/lib/quiz-writes";

const question = (text = "What is 2 + 2?", extra: Partial<EditorQuestion> = {}): EditorQuestion => ({
  text,
  options: [
    { text: "3", isCorrect: false },
    { text: "4", isCorrect: true },
    { text: "5", isCorrect: false },
  ],
  ...extra,
});

const validQuiz = (overrides: Record<string, unknown> = {}) => ({
  title: "Maths",
  description: "",
  duration: 20,
  accessCode: "",
  requiresAccessCode: false,
  isPublic: true,
  active: true,
  isAutoCheck: true,
  showAnswerReview: true,
  examMode: "practice",
  levels: { easy: { duration: 10, pointsMultiplier: 1, questions: [question()] } },
  ...overrides,
});

const issuesOf = (raw: unknown) => {
  const result = validateQuizInput(raw);
  return result.ok ? [] : result.issues.map((issue) => issue.message);
};

describe("validateQuizInput", () => {
  it("accepts a complete quiz and returns it cleaned", () => {
    const result = validateQuizInput(
      validQuiz({
        title: "  Maths  ",
        accessCode: " ab c12 ",
        levels: {
          easy: { duration: 10, pointsMultiplier: 1, questions: [question("  Two plus two?  ")] },
          hard: { duration: 5, pointsMultiplier: 1.5, questions: [] },
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Maths");
    expect(result.value.accessCode).toBe("ABC12");
    expect(result.value.levels.easy?.questions[0].text).toBe("Two plus two?");
    // A level with no questions is not part of the quiz.
    expect(result.value.levels.hard).toBeUndefined();
  });

  it("fills in defaults for the optional switches", () => {
    const { title, duration, levels } = validQuiz();
    const result = validateQuizInput({ title, duration, levels });
    expect(result).toMatchObject({
      ok: true,
      value: { requiresAccessCode: false, isPublic: true, active: true, isAutoCheck: true, showAnswerReview: true, examMode: "practice", accessCode: "" },
    });
  });

  it("rejects what is missing or malformed, in words an admin can act on", () => {
    expect(issuesOf(null)).toEqual(["The quiz is not valid."]);
    expect(issuesOf(validQuiz({ title: "   " }))).toContain("Give the quiz a title.");
    expect(issuesOf(validQuiz({ duration: 0 }))).toHaveLength(1);
    expect(issuesOf(validQuiz({ duration: 12.5 }))).toHaveLength(1);
    expect(issuesOf(validQuiz({ duration: LIMITS.maxMinutes + 1 }))).toHaveLength(1);
    expect(issuesOf(validQuiz({ accessCode: "no!" }))).toContain("An access code is 4 to 10 letters or digits.");
    expect(issuesOf(validQuiz({ examMode: "loose" }))).toContain("Exam mode must be practice or strict.");
    expect(issuesOf(validQuiz({ isPublic: "yes" }))).toHaveLength(1);
    expect(issuesOf(validQuiz({ levels: {} }))).toContain("Add at least one question.");
    expect(issuesOf(validQuiz({ levels: undefined }))).toContain("Add at least one question.");
    expect(issuesOf(validQuiz({ levels: { expert: { duration: 5, pointsMultiplier: 1, questions: [question()] } } }))).toContain(
      '"expert" is not a difficulty level.'
    );
  });

  it("says which question is wrong", () => {
    const broken = {
      easy: {
        duration: 10,
        pointsMultiplier: 1,
        questions: [question(), question("Second", { options: [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }] })],
      },
    };
    const result = validateQuizInput(validQuiz({ levels: broken }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toEqual({
      message: "Easy · Question 2: pick the correct answer.",
      level: "easy",
      question: 1,
    });
  });

  it("needs exactly one correct option, filled-in options, and 2 to 10 of them", () => {
    const levelWith = (q: unknown) => ({ easy: { duration: 10, pointsMultiplier: 1, questions: [q] } });
    const two = (isCorrect: boolean[]) => ({
      text: "Q",
      options: isCorrect.map((c, i) => ({ text: `o${i}`, isCorrect: c })),
    });
    expect(issuesOf(validQuiz({ levels: levelWith(two([true, true])) }))[0]).toMatch(/only one option can be correct/);
    expect(issuesOf(validQuiz({ levels: levelWith(two([true])) }))[0]).toMatch(/between 2 and 10 options/);
    expect(issuesOf(validQuiz({ levels: levelWith(two(Array(11).fill(false))) }))[0]).toMatch(/between 2 and 10 options/);
    expect(
      issuesOf(validQuiz({ levels: levelWith({ text: "Q", options: [{ text: " ", isCorrect: true }, { text: "b", isCorrect: false }] }) }))[0]
    ).toMatch(/option 1 is empty/);
    expect(issuesOf(validQuiz({ levels: levelWith({ text: "", options: two([true, false]).options }) }))[0]).toMatch(/write the question/);
  });

  it("keeps the multiplier at 1 or more (a lower one would not be applied) and the level time sensible", () => {
    const level = (extra: object) => ({ easy: { duration: 10, pointsMultiplier: 1, questions: [question()], ...extra } });
    expect(issuesOf(validQuiz({ levels: level({ pointsMultiplier: 0.5 }) }))[0]).toMatch(/multiplier must be between 1 and 5/);
    expect(issuesOf(validQuiz({ levels: level({ pointsMultiplier: 6 }) }))[0]).toMatch(/multiplier/);
    expect(issuesOf(validQuiz({ levels: level({ pointsMultiplier: "2" }) }))[0]).toMatch(/multiplier/);
    expect(issuesOf(validQuiz({ levels: level({ duration: 0 }) }))[0]).toMatch(/time limit/);
    expect(validateQuizInput(validQuiz({ levels: level({ pointsMultiplier: 1.25 }) })).ok).toBe(true);
  });

  it("only takes https image links, drops blank optional fields, and checks ids", () => {
    const withQuestion = (extra: object) => validQuiz({ levels: { easy: { duration: 10, pointsMultiplier: 1, questions: [{ ...question(), ...extra }] } } });
    expect(issuesOf(withQuestion({ imageUrl: "http://example.com/a.png" }))[0]).toMatch(/https/);
    expect(issuesOf(withQuestion({ imageUrl: "javascript:alert(1)" }))[0]).toMatch(/https/);
    expect(issuesOf(withQuestion({ id: "../other" }))[0]).toMatch(/id is not valid/);

    const clean = validateQuizInput(withQuestion({ imageUrl: "  ", explanation: "   " }));
    expect(clean.ok).toBe(true);
    if (clean.ok) {
      expect(clean.value.levels.easy?.questions[0]).not.toHaveProperty("imageUrl");
      expect(clean.value.levels.easy?.questions[0]).not.toHaveProperty("explanation");
    }

    const dupes = validQuiz({ levels: { easy: { duration: 10, pointsMultiplier: 1, questions: [{ ...question(), id: "a" }, { ...question("Other"), id: "a" }] } } });
    expect(issuesOf(dupes)[0]).toMatch(/repeats another question's id/);
  });

  it("caps a level at the number of questions an attempt can hold", () => {
    const many = Array.from({ length: LIMITS.maxQuestionsPerLevel + 1 }, () => question());
    expect(issuesOf(validQuiz({ levels: { easy: { duration: 10, pointsMultiplier: 1, questions: many } } }))[0]).toMatch(/up to 400 questions/);
  });
});

describe("stored shape", () => {
  it("writes one canonical document, keeping the explanation and image only when set", () => {
    expect(questionToDoc(question("Q"), 3)).toEqual({
      text: "Q",
      options: [
        { text: "3", isCorrect: false },
        { text: "4", isCorrect: true },
        { text: "5", isCorrect: false },
      ],
      points: 1,
      type: "single",
      order: 3,
    });
    const full = questionToDoc(question("Q", { explanation: "Because.", imageUrl: "https://example.com/a.png" }), 0);
    expect(full).toMatchObject({ explanation: "Because.", imageUrl: "https://example.com/a.png" });
  });

  it("reads every older shape back into the same editor form", () => {
    const flags = questionFromStored("a", { text: "Q", options: [{ text: "x", isCorrect: false }, { text: "y", isCorrect: true }] });
    const strings = questionFromStored("a", { text: "Q", options: ["x", "y"], correctIndex: 1 });
    expect(strings).toEqual(flags);
    expect(flags.options.map((o) => o.isCorrect)).toEqual([false, true]);
    // No key at all: nothing is marked right, so the editor makes the admin pick.
    expect(questionFromStored("a", { text: "Q", options: ["x", "y"] }).options.some((o) => o.isCorrect)).toBe(false);
  });

  it("orders by `order`, then questions without one, then by id", () => {
    const docs = [
      { id: "z", data: { order: 0 } },
      { id: "b", data: {} },
      { id: "a", data: {} },
      { id: "y", data: { order: 1 } },
    ];
    expect(sortQuestionDocs(docs).map((d) => d.id)).toEqual(["z", "y", "a", "b"]);
    // All unnumbered: plain id order, which is what Firestore returned before `order` existed.
    expect(sortQuestionDocs([{ id: "b", data: {} }, { id: "a", data: {} }]).map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("legacy questions", () => {
  const legacy = [
    { id: "n1", data: { text: "No level" } },
    { id: "e1", data: { text: "Easy only", difficulty: "easy" } },
    { id: "h1", data: { text: "Hard only", difficulty: "hard" } },
  ];

  it("sends a question that names a level there, and one that doesn't to every level", () => {
    const plan = planLegacyQuestions(legacy, ["easy", "medium", "hard"], new Set<Level>());
    expect(plan.easy?.map((d) => d.id)).toEqual(["e1", "n1"]);
    expect(plan.medium?.map((d) => d.id)).toEqual(["n1"]);
    expect(plan.hard?.map((d) => d.id)).toEqual(["h1", "n1"]);
  });

  it("leaves a level alone when it already has its own questions", () => {
    const plan = planLegacyQuestions(legacy, ["easy", "medium"], new Set<Level>(["easy"]));
    expect(plan.easy).toBeUndefined();
    expect(plan.medium?.map((d) => d.id)).toEqual(["n1"]);
  });
});

describe("planQuestionWrites", () => {
  let counter = 0;
  const newId = () => `new${++counter}`;
  const levels = (list: EditorQuestion[]) => ({ easy: { duration: 10, pointsMultiplier: 1, questions: list } });

  it("creates every question of a new quiz, numbered in order", () => {
    const writes = planQuestionWrites(levels([question("A"), question("B")]), emptyExisting(), newId);
    expect(writes.sets.map((s) => [s.collection, s.data.text, s.data.order])).toEqual([
      ["questions_easy", "A", 0],
      ["questions_easy", "B", 1],
    ]);
    expect(writes.removes).toEqual([]);
    expect(writes.counts).toEqual({ easy: 2 });
  });

  it("writes only what changed, and removes what is gone", () => {
    const same = questionToDoc(question("Same"), 0);
    const existing = emptyExisting();
    existing.byLevel.easy = [
      { id: "keep", data: { ...same } },
      { id: "edit", data: { ...questionToDoc(question("Old"), 1) } },
      { id: "gone", data: { ...questionToDoc(question("Gone"), 2) } },
    ];
    const writes = planQuestionWrites(
      levels([{ ...question("Same"), id: "keep" }, { ...question("New text"), id: "edit" }, question("Brand new")]),
      existing,
      newId
    );
    expect(writes.sets.map((s) => s.id)).toEqual(["edit", expect.stringMatching(/^new/)]);
    expect(writes.sets[0].data.text).toBe("New text");
    expect(writes.removes).toEqual([{ collection: "questions_easy", id: "gone" }]);
  });

  it("reorders by rewriting `order`, and never trusts an id it doesn't know", () => {
    const existing = emptyExisting();
    existing.byLevel.easy = [
      { id: "a", data: { ...questionToDoc(question("A"), 0) } },
      { id: "b", data: { ...questionToDoc(question("B"), 1) } },
    ];
    const writes = planQuestionWrites(
      levels([{ ...question("B"), id: "b" }, { ...question("A"), id: "a" }, { ...question("Sneaky"), id: "someone-elses" }]),
      existing,
      newId
    );
    expect(writes.sets.filter((s) => s.id === "a" || s.id === "b").map((s) => [s.id, s.data.order])).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
    const sneaky = writes.sets.find((s) => s.data.text === "Sneaky");
    expect(sneaky?.id).not.toBe("someone-elses");
  });

  it("removes a level that was dropped, and empties the old shared collection (moving its questions)", () => {
    const existing = emptyExisting();
    existing.byLevel.hard = [{ id: "h", data: { ...questionToDoc(question("H"), 0) } }];
    existing.legacy = [{ id: "old1", data: { text: "Old", options: ["x", "y"], correctIndex: 0 } }];
    const writes = planQuestionWrites(
      levels([{ ...questionFromStored("old1", existing.legacy[0].data) }]),
      existing,
      newId
    );
    // Moved under its own id; the legacy copy and the dropped level go.
    expect(writes.sets).toHaveLength(1);
    expect(writes.sets[0]).toMatchObject({ collection: "questions_easy", id: "old1" });
    expect(writes.removes).toEqual(
      expect.arrayContaining([
        { collection: "questions_hard", id: "h" },
        { collection: "questions", id: "old1" },
      ])
    );
  });
});

describe("access codes, import and export", () => {
  it("makes codes from letters and digits people can tell apart", () => {
    let n = 0;
    const code = makeAccessCode(() => n++ % 32);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(code).not.toMatch(/[01OIL]/);
  });

  it("exports to JSON an import can read back", () => {
    const original = [question("One"), question("Two", { explanation: "Because." })];
    const back = parseImportedQuestions(exportQuestions(original));
    expect(back).toEqual({
      ok: true,
      questions: original.map((q) => ({ ...q })),
    });
  });

  it("imports string options with a correctIndex, and a { questions: [] } wrapper", () => {
    const text = JSON.stringify({ questions: [{ text: "Q", options: ["a", "b", "c"], correctIndex: 2 }] });
    const result = parseImportedQuestions(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions[0].options.map((o) => o.isCorrect)).toEqual([false, false, true]);
      expect(result.questions[0]).not.toHaveProperty("id");
    }
  });

  it("explains what is wrong with an import", () => {
    expect(parseImportedQuestions("nope")).toMatchObject({ ok: false, message: expect.stringMatching(/valid JSON/) });
    expect(parseImportedQuestions("{}")).toMatchObject({ ok: false, message: "Expected a list of questions." });
    expect(parseImportedQuestions("[]")).toMatchObject({ ok: false });
    expect(parseImportedQuestions('[{"text":"Q"}]')).toMatchObject({ ok: false, message: 'Question 1 needs "text" and "options".' });
  });

  it("starts a new question with four empty options and nothing picked", () => {
    const blank = blankQuestion();
    expect(blank.options).toHaveLength(4);
    expect(blank.options.some((o) => o.isCorrect)).toBe(false);
  });
});
