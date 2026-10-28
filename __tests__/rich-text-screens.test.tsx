// @vitest-environment jsdom
// Rich text where questions are shown (docs/RICH_TEXT_PLAN.md, R2): the exam question and its focus and
// heading structure, the review, and the editor's Grid, which must never flatten a table:
//   npx vitest run __tests__/rich-text-screens.test.tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionGrid } from "@/components/admin/quiz-editor/QuestionGrid";
import type { DraftQuestion } from "@/components/admin/quiz-editor/editor-state";
import QuestionReview from "@/components/quiz/exam/QuestionReview";
import QuestionView from "@/components/quiz/exam/QuestionView";
import type { ExamQuestion } from "@/lib/exam/types";

afterEach(cleanup);

const TABLE = "| Region | Q1 |\n|:--|--:|\n| North | 120 |\n| South | 90 |";
const SCENARIO = `A company recorded these sales.\n\n${TABLE}\n\nWhich region sold more in Q1?`;

const question = (text: string, extra: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id: "q1",
  text,
  options: ["North", "South"],
  type: "single",
  ...extra,
});

const view = (q: ExamQuestion) =>
  render(
    <QuestionView question={q} position={2} total={5} selected={[]} onSelect={vi.fn()} onClear={vi.fn()} />
  );

describe("QuestionView with a table", () => {
  it("reads 'Question 2 of 5' as the heading and keeps the table out of it", () => {
    view(question(SCENARIO));
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Question 2 of 5");
    expect(heading.className).toContain("sr-only");
    expect(heading.querySelector("table")).toBeNull();
  });

  it("puts focus on the question block, which is labelled by the heading and holds the table", async () => {
    view(question(SCENARIO));
    const block = screen.getByRole("group", { name: "Question 2 of 5" });
    expect(document.activeElement).toBe(block);
    expect(block.getAttribute("tabindex")).toBe("-1");
    expect(await within(block).findByRole("table")).toBeTruthy();
    expect(document.activeElement).toBe(block);
    expect(within(block).getByText("Which region sold more in Q1?")).toBeTruthy();
  });

  it("names the options 'Question 2 of 5' only when the question has a table", () => {
    view(question(SCENARIO));
    expect(screen.getByRole("radiogroup", { name: "Question 2 of 5" })).toBeTruthy();
  });

  it("names the options by a plain question's text, as before", () => {
    view(question("Which planet is closest to the sun?"));
    expect(screen.getByRole("radiogroup", { name: "Question 2 of 5 Which planet is closest to the sun?" })).toBeTruthy();
  });

  it("shows marks inside an option, never as raw asterisks", () => {
    view(question("Pick one.", { options: ["Use `a | b` here", "**Never** do this"] }));
    const [first, second] = screen.getAllByRole("radio");
    expect(first.closest("label")?.querySelector("code")?.textContent).toBe("a | b");
    expect(second.closest("label")?.querySelector("strong")?.textContent).toBe("Never");
  });
});

describe("QuestionView with plain text (golden)", () => {
  // Texts a question might hold today. Each must show the same words in the same order as before.
  const PLAIN = [
    "Which planet is closest to the sun?",
    "First line\nSecond line",
    "a | b - c * d _ e",
    "Use 2*3*4 and snake_case_name",
    "1. only one numbered line",
    "- a lone dash",
    "Is 5 > 3 and 2 < 4?",
    "Path C:\\new\\folder",
    "What does <b> do in HTML?",
  ];

  it.each(PLAIN)("%j", (text) => {
    view(question(text));
    const block = screen.getByRole("group", { name: "Question 2 of 5" });
    expect(block.textContent).toBe(text.replace(/\n/g, ""));
    expect(block.querySelector("table, ul, ol, pre, strong, em, code, a, img")).toBeNull();
    expect(block.querySelectorAll("br")).toHaveLength(text.split("\n").length - 1);
  });
});

describe("QuestionReview with rich text", () => {
  const show = (q: ExamQuestion, review: Parameters<typeof QuestionReview>[0]["review"], answer: number[]) =>
    render(
      <ol>
        <QuestionReview question={q} review={review} position={3} answer={answer} />
      </ol>
    );

  it("shows the question's table and the explanation's table, with 'Question 3' as the heading", async () => {
    show(question(SCENARIO), { correct: [0], explanation: `Compare the rows.\n\n${TABLE}` }, [0]);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Question 3");
    await waitFor(() => expect(screen.getAllByRole("table")).toHaveLength(2));
    expect(screen.getByText("Compare the rows.")).toBeTruthy();
  });

  it("shows marks in options and reasons", () => {
    show(
      question("Pick one.", { options: ["`x` is right", "y"] }),
      { correct: [0], optionRationales: ["Because **x** wins", "Because _y_ loses"], explanation: "- one\n- two" },
      [1]
    );
    expect(document.querySelector("li code")?.textContent).toBe("x");
    expect(screen.getByText("x", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("y", { selector: "em" })).toBeTruthy();
    expect([...document.querySelectorAll("ul.list-disc li")].map((li) => li.textContent)).toEqual(["one", "two"]);
  });

  it("leaves a plain question's words as they were", () => {
    show(question("Which planet is closest to the sun?"), { correct: [0], explanation: "Mercury orbits closest." }, [0]);
    expect(screen.getByText("Which planet is closest to the sun?")).toBeTruthy();
    expect(screen.getByText("Mercury orbits closest.")).toBeTruthy();
  });
});

describe("QuestionGrid with multi-line text", () => {
  const draft = (text: string, optionText = "A"): DraftQuestion => ({
    key: "k1",
    type: "single",
    text,
    options: [
      { text: optionText, isCorrect: true },
      { text: "B", isCorrect: false },
    ],
  });

  const grid = (questions: DraftQuestion[]) => {
    const dispatch = vi.fn();
    const onOpenCard = vi.fn();
    render(
      <QuestionGrid
        level="easy"
        questions={questions}
        selected={new Set()}
        onSelect={vi.fn()}
        onSelectAll={vi.fn()}
        problems={new Map()}
        dispatch={dispatch}
        onReplace={vi.fn()}
        onOpenCard={onOpenCard}
        onPreview={vi.fn()}
      />
    );
    return { dispatch, onOpenCard };
  };

  const text = `Look at the table.\n\n${TABLE}`;

  it("shows the first line read-only with a tag, and cannot be typed over", () => {
    const { dispatch } = grid([draft(text)]);
    const cell = screen.getByLabelText(/^Question 1, has several lines \(table\)/) as HTMLInputElement;
    expect(cell.readOnly).toBe(true);
    expect(cell.value).toBe("Look at the table.");
    expect(screen.getByText("table")).toBeTruthy();
    fireEvent.change(cell, { target: { value: "flattened" } });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("opens the question's card when clicked", () => {
    const { onOpenCard } = grid([draft(text)]);
    fireEvent.click(screen.getByLabelText(/^Question 1, has several lines/));
    expect(onOpenCard).toHaveBeenCalledWith(0);
  });

  it("does the same for an option with a line break", () => {
    const { dispatch } = grid([draft("Plain one-line question?", "first\nsecond")]);
    const cell = screen.getByLabelText(/^Question 1, option A, correct, has several lines/) as HTMLInputElement;
    expect(cell.readOnly).toBe(true);
    expect(cell.value).toBe("first");
    fireEvent.change(cell, { target: { value: "x" } });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps a one-line question editable", () => {
    const { dispatch } = grid([draft("Plain one-line question?")]);
    const cell = screen.getByLabelText("Question 1") as HTMLInputElement;
    expect(cell.readOnly).toBe(false);
    fireEvent.change(cell, { target: { value: "Changed?" } });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "gridCell", column: 0, value: "Changed?" }));
  });
});
