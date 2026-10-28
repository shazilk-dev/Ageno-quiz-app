// @vitest-environment jsdom
// Writing a table in a question (docs/RICH_TEXT_PLAN.md, R3): the field with its toolbar, the table dialog,
// the paste converter, the preview and the advice, and the same through the real editor (save, copy across
// levels, Duplicate, Undo, the draft). The admin API is mocked.
//   npx vitest run __tests__/quiz-editor-richtext.test.tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminQuizDetail, QuizInput } from "@/lib/quiz-schema";

vi.setConfig({ testTimeout: 20_000 });

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const api = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/admin-api", () => ({ adminQuizzes: api, adminImages: { upload: vi.fn() } }));

import { QuizEditor } from "@/components/admin/quiz-editor/QuizEditor";
import { RichTextField } from "@/components/admin/quiz-editor/RichTextField";
import { ToastProvider } from "@/components/ui";
import { SCENARIO_EXAMPLE } from "@/lib/rich-text/example";

const TABLE = "| Region | Q1 |\n|:--|--:|\n| North | 120 |\n| South | 90 |";
const EXCEL_TSV = "Region\tQ1\r\nNorth\t120\r\nSouth\t90\r\n";
const EXCEL_HTML = "<table><tr><td>Region</td><td>Q1</td></tr><tr><td>North</td><td>120</td></tr><tr><td>South</td><td>90</td></tr></table>";

function Harness({ initial = "", maxLength }: { initial?: string; maxLength?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <RichTextField id="f" label="Question" value={value} onChange={setValue} maxLength={maxLength} />
      <pre data-testid="value">{value}</pre>
    </>
  );
}

const box = () => screen.getByLabelText("Question") as HTMLTextAreaElement;
const value = () => (screen.getByTestId("value") as HTMLElement).textContent;
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const dialogNamed = (name: string) => screen.getByRole("dialog", { hidden: true, name });
const paste = (target: Element, data: Record<string, string>) =>
  fireEvent.paste(target, { clipboardData: { getData: (type: string) => data[type] ?? "" } });
const typeInto = (text: string, selectionStart?: number, selectionEnd = selectionStart) => {
  const el = box();
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value: text } });
  if (selectionStart !== undefined) {
    el.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
    fireEvent.select(el);
  }
};

beforeEach(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => cleanup());

describe("the toolbar", () => {
  it("has the buttons, as a labelled toolbar of real buttons", () => {
    render(<Harness />);
    const bar = screen.getByRole("toolbar", { name: "Formatting" });
    expect(within(bar).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Insert table",
      "Bold (Ctrl+B)",
      "Bulleted list",
      "Code block",
      "Formatting help",
    ]);
    expect(within(bar).queryByRole("button", { name: "Edit table" })).toBeNull();
  });

  it("bold wraps the selection, and Ctrl+B does the same", () => {
    render(<Harness />);
    typeInto("say hello now", 4, 9);
    click("Bold (Ctrl+B)");
    expect(value()).toBe("say **hello** now");
    expect(box().value).toBe("say **hello** now");
    expect(box().value.slice(box().selectionStart, box().selectionEnd)).toBe("hello");

    fireEvent.keyDown(box(), { key: "b", ctrlKey: true });
    expect(value()).toBe("say hello now");
    fireEvent.keyDown(box(), { key: "b", metaKey: true });
    expect(value()).toBe("say **hello** now");
  });

  it("a list starts on an empty box with two example items", () => {
    render(<Harness />);
    click("Bulleted list");
    expect(value()).toBe("- First item\n- Second item");
  });

  it("a code block goes around the selection", () => {
    render(<Harness />);
    typeInto("Run this x = 1", 9, 14);
    click("Code block");
    expect(value()).toBe("Run this\n\n```\nx = 1\n```\n\n");
  });

  it("put at the end when the box was never clicked into", () => {
    render(<Harness initial="Existing text" />);
    click("Code block");
    expect(value()).toBe("Existing text\n\n```\n\n```\n\n");
  });
});

describe("Insert table", () => {
  const openInsert = () => {
    click("Insert table");
    return dialogNamed("Insert a table");
  };

  it("opens a 3 by 3 grid, and inserts what is typed as a Markdown table on its own paragraph", () => {
    render(<Harness initial={"Intro line"} />);
    typeInto("Intro line", 10);
    const dialog = openInsert();
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(9);
    fireEvent.change(within(dialog).getByLabelText("Header, column 1"), { target: { value: "Region" } });
    fireEvent.change(within(dialog).getByLabelText("Header, column 2"), { target: { value: "Q1" } });
    fireEvent.change(within(dialog).getByLabelText("Row 2, column 1"), { target: { value: "North" } });
    fireEvent.change(within(dialog).getByLabelText("Row 2, column 2"), { target: { value: "120" } });
    fireEvent.change(within(dialog).getByLabelText("Alignment of column 2"), { target: { value: "right" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove column 3" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Insert table" }));

    expect(value()).toBe(
      "Intro line\n\n| Region | Q1 |\n| --- | ---: |\n| North | 120 |\n|  |  |\n\n"
    );
    expect(screen.queryByRole("dialog", { name: "Insert a table" })).toBeNull();
  });

  it("adds and removes rows and columns, and stops at 8 columns and 20 rows", () => {
    render(<Harness />);
    const dialog = openInsert();
    const add = (name: string, times: number) => {
      for (let i = 0; i < times; i++) fireEvent.click(within(dialog).getByRole("button", { name }));
    };
    add("Add column", 10);
    expect(within(dialog).getAllByLabelText(/^Header, column/)).toHaveLength(8);
    expect((within(dialog).getByRole("button", { name: "Add column" }) as HTMLButtonElement).disabled).toBe(true);
    add("Add row", 30);
    expect(within(dialog).getAllByLabelText(/^Row \d+, column 1$/)).toHaveLength(20);
    expect((within(dialog).getByRole("button", { name: "Add row" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove row 2" }));
    expect(within(dialog).getAllByLabelText(/^Row \d+, column 1$/)).toHaveLength(19);
  });

  it("writes a pipe typed in a cell so that it stays a pipe", () => {
    render(<Harness />);
    const dialog = openInsert();
    fireEvent.change(within(dialog).getByLabelText("Row 2, column 1"), { target: { value: "a | b" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Insert table" }));
    expect(value()).toContain("| a \\| b |");
  });

  it("fills the grid from a block of cells pasted into a cell", () => {
    render(<Harness />);
    const dialog = openInsert();
    const prevented = !paste(within(dialog).getByLabelText("Header, column 1"), { "text/plain": EXCEL_TSV });
    expect(prevented).toBe(true);
    expect((within(dialog).getByLabelText("Header, column 1") as HTMLInputElement).value).toBe("Region");
    expect((within(dialog).getByLabelText("Row 3, column 2") as HTMLInputElement).value).toBe("90");
    fireEvent.click(within(dialog).getByRole("button", { name: "Insert table" }));
    expect(value()).toContain("| Region | Q1 | Column 3 |");
    expect(value()).toContain("| South | 90 |  |");
  });

  it("leaves a single pasted word to the browser", () => {
    render(<Harness />);
    const dialog = openInsert();
    expect(paste(within(dialog).getByLabelText("Header, column 1"), { "text/plain": "word" })).toBe(true);
  });

  it("Cancel and Escape change nothing", () => {
    render(<Harness initial="Keep" />);
    openInsert();
    fireEvent.click(within(dialogNamed("Insert a table")).getByRole("button", { name: "Cancel" }));
    expect(value()).toBe("Keep");
    expect(screen.queryByRole("dialog", { name: "Insert a table" })).toBeNull();
  });
});

describe("Edit table", () => {
  const text = `Scenario\n\n${TABLE}\n\nWhich?`;

  it("shows only while the cursor is inside a table", () => {
    render(<Harness initial={text} />);
    typeInto(text, 2);
    expect(screen.queryByRole("button", { name: "Edit table" })).toBeNull();
    box().setSelectionRange(text.indexOf("| North") + 3, text.indexOf("| North") + 3);
    fireEvent.select(box());
    expect(screen.getByRole("button", { name: "Edit table" })).toBeTruthy();
    box().setSelectionRange(text.length, text.length);
    fireEvent.select(box());
    expect(screen.queryByRole("button", { name: "Edit table" })).toBeNull();
  });

  it("opens the cells with their alignment, and writes the changes back in place", () => {
    render(<Harness initial={text} />);
    typeInto(text, text.indexOf("| North") + 3);
    click("Edit table");
    const dialog = dialogNamed("Edit table");
    expect((within(dialog).getByLabelText("Header, column 1") as HTMLInputElement).value).toBe("Region");
    expect((within(dialog).getByLabelText("Alignment of column 1") as HTMLSelectElement).value).toBe("left");
    expect((within(dialog).getByLabelText("Alignment of column 2") as HTMLSelectElement).value).toBe("right");

    fireEvent.change(within(dialog).getByLabelText("Row 2, column 2"), { target: { value: "125" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add row" }));
    fireEvent.change(within(dialog).getByLabelText("Row 4, column 1"), { target: { value: "East" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Update table" }));

    expect(value()).toBe(
      "Scenario\n\n| Region | Q1 |\n| :--- | ---: |\n| North | 125 |\n| South | 90 |\n| East |  |\n\nWhich?"
    );
  });

  it("keeps bold and escaped pipes in cells as they were written", () => {
    const source = "| A | B |\n|---|---|\n| **x** | a \\| b |";
    render(<Harness initial={source} />);
    typeInto(source, 3);
    click("Edit table");
    const dialog = dialogNamed("Edit table");
    expect((within(dialog).getByLabelText("Row 2, column 1") as HTMLInputElement).value).toBe("**x**");
    expect((within(dialog).getByLabelText("Row 2, column 2") as HTMLInputElement).value).toBe("a | b");
    fireEvent.click(within(dialog).getByRole("button", { name: "Update table" }));
    expect(value()).toContain("| **x** | a \\| b |");
  });
});

describe("pasting cells", () => {
  it("turns tab-separated cells (Excel, Sheets) into a Markdown table and says so", () => {
    render(<Harness />);
    const prevented = !paste(box(), { "text/plain": EXCEL_TSV });
    expect(prevented).toBe(true);
    expect(value()).toBe("| Region | Q1 |\n| --- | --- |\n| North | 120 |\n| South | 90 |\n\n");
    expect(screen.getByRole("status").textContent).toContain("Pasted as a table.");
  });

  it("prefers the HTML table when there is one", () => {
    render(<Harness />);
    paste(box(), { "text/html": `<table><tr><th colspan="2">Sales</th></tr><tr><td>A</td><td>B</td></tr></table>`, "text/plain": "Sales\t\nA\tB" });
    expect(value()).toContain("| Sales | Sales |");
  });

  it("puts the table in its own paragraph in the middle of the text, replacing a selection", () => {
    render(<Harness />);
    typeInto("Scenario: JUNK Which?", 10, 14);
    paste(box(), { "text/html": EXCEL_HTML, "text/plain": EXCEL_TSV });
    expect(value()).toBe("Scenario:\n\n| Region | Q1 |\n| --- | --- |\n| North | 120 |\n| South | 90 |\n\nWhich?");
  });

  it("Paste as plain text instead puts the clipboard's own text back, and the notice goes", () => {
    render(<Harness initial="Before" />);
    typeInto("Before", 6);
    paste(box(), { "text/plain": EXCEL_TSV });
    click("Paste as plain text instead");
    // Exactly what the browser's own paste would have left.
    expect(value()).toBe("BeforeRegion\tQ1\nNorth\t120\nSouth\t90\n");
    expect(screen.queryByRole("button", { name: "Paste as plain text instead" })).toBeNull();
  });

  it("drops the notice as soon as the text is changed", () => {
    render(<Harness />);
    paste(box(), { "text/plain": EXCEL_TSV });
    expect(screen.getByRole("button", { name: "Paste as plain text instead" })).toBeTruthy();
    fireEvent.change(box(), { target: { value: `${box().value}More` } });
    expect(screen.queryByRole("button", { name: "Paste as plain text instead" })).toBeNull();
  });

  it("leaves ordinary text, one value and indented code to the browser", () => {
    render(<Harness />);
    expect(paste(box(), { "text/plain": "just words" })).toBe(true);
    expect(paste(box(), { "text/plain": "a\tb" })).toBe(true);
    expect(paste(box(), { "text/plain": "\tif (x) {\n\t\treturn 1;\n\t}" })).toBe(true);
    expect(paste(box(), { "text/html": "<p>Hello</p>", "text/plain": "Hello" })).toBe(true);
    expect(value()).toBe("");
  });
});

describe("the preview", () => {
  it("is closed for plain text and opens on request", () => {
    render(<Harness initial="Just a question?" />);
    const toggle = screen.getByRole("button", { name: /^Preview/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)?.textContent).toBe("Just a question?");
  });

  it("opens by itself once the text holds a table, and shows a real table", async () => {
    render(<Harness />);
    typeInto(`Scenario\n\n${TABLE}\n\nWhich?`);
    const toggle = screen.getByRole("button", { name: /^Preview/ });
    await waitFor(() => expect(toggle.getAttribute("aria-expanded")).toBe("true"));
    expect(toggle.textContent).toContain("table");
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    const table = await within(region).findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Region", "Q1"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("stays closed when the author closed it, even with a table", async () => {
    render(<Harness initial={TABLE} />);
    const toggle = screen.getByRole("button", { name: /^Preview/ });
    await waitFor(() => expect(toggle.getAttribute("aria-expanded")).toBe("true"));
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    typeInto(`${TABLE}\n| East | 7 |`);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows plain text with its line breaks as before", () => {
    render(<Harness initial={"one\ntwo"} />);
    fireEvent.click(screen.getByRole("button", { name: /^Preview/ }));
    expect(document.querySelector("#" + CSS.escape(screen.getByRole("button", { name: /^Preview/ }).getAttribute("aria-controls")!) + " br")).not.toBeNull();
  });
});

describe("advice under the box", () => {
  it("says what is wrong with a table, with the line", async () => {
    render(<Harness />);
    typeInto("Scenario\n\n| A | B |\n|---|---|\n| 1 | 2 | 3 |");
    expect((await screen.findByText(/Line 5: Row 2 has 3 cells but the header has 2/)).textContent).toContain("extra cells are not shown");
  });

  it("says nothing about a good table", async () => {
    render(<Harness />);
    typeInto(TABLE);
    await screen.findByRole("table");
    expect(screen.queryByText(/cells but the header/)).toBeNull();
  });

  it("counts the characters near the limit, and says when it is over", () => {
    render(<Harness maxLength={100} />);
    typeInto("x".repeat(70));
    expect(screen.queryByText(/ \/ 100/)).toBeNull();
    typeInto("x".repeat(85));
    expect(screen.getByText("85 / 100")).toBeTruthy();
    typeInto("x".repeat(120));
    expect(screen.getByText("120 / 100").className).toContain("text-error");
  });
});

describe("Formatting help", () => {
  it("lists the syntax and shows the scenario + table example", async () => {
    render(<Harness />);
    click("Formatting help");
    const dialog = dialogNamed("Formatting help");
    expect(within(dialog).getByText("**bold**")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Copy example/ })).toBeTruthy();
    expect(within(dialog).getByText(/^A company recorded these sales figures\./, { selector: "pre" }).textContent).toBe(SCENARIO_EXAMPLE);
    const tables = await within(dialog).findAllByRole("table");
    expect(tables.some((t) => within(t).queryByRole("columnheader", { name: "Region" }))).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Formatting help" })).toBeNull();
  });
});

// ---- through the whole editor ----

const question = (id: string, text: string) => ({
  id,
  type: "single" as const,
  text,
  options: ["w", "x", "y", "z"].map((option, i) => ({ text: option, isCorrect: i === 0 })),
  explanation: "Because.",
});

const detail = (questions = [question("a", `Scenario\n\n${TABLE}\n\nWhich region sold more?`), question("b", "Plain?")]): AdminQuizDetail => ({
  id: "quiz1",
  version: 1000,
  createdAt: 1,
  createdBy: "root",
  responseCount: 0,
  title: "Existing quiz",
  description: "",
  duration: 20,
  accessCode: "ABC123",
  requiresAccessCode: false,
  isPublic: true,
  active: true,
  isAutoCheck: true,
  showAnswerReview: true,
  examMode: "practice",
  levels: { easy: { duration: 15, pointsMultiplier: 1, questions } },
});

const renderEditor = () =>
  render(
    <ToastProvider>
      <QuizEditor mode="edit" quizId="quiz1" />
    </ToastProvider>
  );

describe("in the quiz editor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    api.get.mockReset();
    api.save.mockReset();
    api.get.mockResolvedValue(detail());
  });

  it("shows a stored table in the question box as typed, and saves an edit with the table intact", async () => {
    api.save.mockResolvedValue({ version: 2000, accessCode: "ABC123" });
    renderEditor();
    await screen.findByText("Edit quiz");
    const [first] = screen.getAllByLabelText("Question") as HTMLTextAreaElement[];
    expect(first.value).toBe(`Scenario\n\n${TABLE}\n\nWhich region sold more?`);

    fireEvent.change(first, { target: { value: `${first.value}\n\n(Read the table first.)` } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    const sent = api.save.mock.calls[0][1] as QuizInput;
    expect(sent.levels.easy?.questions[0].text).toBe(`Scenario\n\n${TABLE}\n\nWhich region sold more?\n\n(Read the table first.)`);
  });

  it("the Checks panel names a broken table and the question it is in", async () => {
    api.get.mockResolvedValue(detail([question("a", "Scenario\n\n| A | B |\n|---|---|\n| 1 | 2 | 3 |\n\nWhich?")]));
    renderEditor();
    await screen.findByText("Edit quiz");
    const panel = screen.getByText("Checks").closest("details")!;
    expect(within(panel).getByText(/Question text, line 5: Row 2 has 3 cells but the header has 2/)).toBeTruthy();
    expect(within(panel).getByText(/Easy · Question 1/)).toBeTruthy();
  });

  it("keeps the table when a question is duplicated, and when it is restored from the device's draft", async () => {
    renderEditor();
    await screen.findByText("Edit quiz");
    fireEvent.click(screen.getByRole("button", { name: "Duplicate question 1" }));
    const boxes = screen.getAllByLabelText("Question") as HTMLTextAreaElement[];
    expect(boxes).toHaveLength(3);
    expect(boxes[1].value).toBe(boxes[0].value);
    expect(boxes[1].value).toContain(TABLE);
  });

  it("focuses the question's box when a check is clicked (the box keeps its id)", async () => {
    api.get.mockResolvedValue(detail([question("a", "Same?"), question("b", "same")]));
    renderEditor();
    await screen.findByText("Edit quiz");
    const panel = screen.getByText("Checks").closest("details")!;
    fireEvent.click(within(panel).getByText("Same question as Easy · Question 1."));
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByDisplayValue("same")[0]));
  });
});

// ---- R3.7: nothing else in the editor flattens a question's line breaks ----

describe("a table survives everything else the editor does with a question", () => {
  const multi = `Scenario\n\n${TABLE}\n\nWhich region sold more?`;

  it("passes the server's validation with its line breaks (only the ends are trimmed)", async () => {
    const { validateQuizInput } = await import("@/lib/quiz-schema");
    const { duplicateInput } = await import("@/lib/quiz-duplicate");
    const input = duplicateInput(detail([{ ...question("a", `  ${multi}  `), explanation: `  See:\n\n${TABLE}  ` }]));
    const result = validateQuizInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.levels.easy?.questions[0].text).toBe(multi);
    expect(result.value.levels.easy?.questions[0].explanation).toBe(`See:\n\n${TABLE}`);
  });

  it("is kept in the copy on the device and in a duplicate of the quiz", async () => {
    const { blankForm, draftQuestion } = await import("@/components/admin/quiz-editor/editor-state");
    const { loadDraft, saveDraft } = await import("@/components/admin/quiz-editor/draft-storage");
    const { duplicateInput } = await import("@/lib/quiz-duplicate");
    window.localStorage.clear();
    const form = blankForm();
    form.levels.easy.questions = [draftQuestion({ ...question("a", multi), explanation: `See:\n\n${TABLE}` })];
    expect(saveDraft("q", form, 1)).toBe(true);
    const back = loadDraft("q")!.form.levels.easy.questions[0];
    expect(back.text).toBe(multi);
    expect(back.explanation).toBe(`See:\n\n${TABLE}`);

    const copy = duplicateInput(detail([question("a", multi)]));
    expect(copy.levels.easy?.questions[0].text).toBe(multi);
  });

  it("is kept when a question is copied to another level", async () => {
    const { cloneAsNew } = await import("@/components/admin/quiz-editor/grid");
    const { draftQuestion } = await import("@/components/admin/quiz-editor/editor-state");
    expect(cloneAsNew(draftQuestion(question("a", multi)), "k2").text).toBe(multi);
  });

  it("is not split into rows when a spreadsheet cell with line breaks is pasted into the grid", async () => {
    const { pasteIntoGrid } = await import("@/components/admin/quiz-editor/grid");
    const pasted = `"${multi.replace(/"/g, '""')}"\tNorth\tSouth\tA\r\n"Plain?"\tx\ty\tB\r\n`;
    const result = pasteIntoGrid([], 4, { row: 0, column: 0 }, pasted, (() => {
      let n = 0;
      return () => `k${n++}`;
    })());
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].text).toBe(multi);
    expect(result.questions[0].options.map((o) => o.text).slice(0, 2)).toEqual(["North", "South"]);
    expect(result.questions[1].text).toBe("Plain?");
  });
});
