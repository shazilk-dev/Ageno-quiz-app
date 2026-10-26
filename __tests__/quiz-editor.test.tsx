// @vitest-environment jsdom
// Behavioural tests for the admin quiz editor: the form state (reducer), what it refuses, what it sends,
// and how it reacts to a stale save. The admin API is mocked, so nothing here needs a server:
//   npx vitest run __tests__/quiz-editor.test.tsx
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import type { AdminQuizDetail, QuizInput } from "@/lib/quiz-schema";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const api = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/admin-api", () => ({ adminQuizzes: api }));

import { QuizEditor } from "@/components/admin/quiz-editor/QuizEditor";
import {
  blankForm,
  draftQuestion,
  editorReducer,
  snapshotOf,
  validateForm,
} from "@/components/admin/quiz-editor/editor-state";
import { ToastProvider } from "@/components/ui";

const renderEditor = (props: Parameters<typeof QuizEditor>[0] = { mode: "create" }) =>
  render(
    <ToastProvider>
      <QuizEditor {...props} />
    </ToastProvider>
  );

const detail = (overrides: Partial<AdminQuizDetail> = {}): AdminQuizDetail => ({
  id: "quiz1",
  version: 1000,
  createdAt: 1,
  createdBy: "root",
  responseCount: 0,
  title: "Existing quiz",
  description: "About it",
  duration: 20,
  accessCode: "ABC123",
  requiresAccessCode: true,
  isPublic: true,
  active: true,
  isAutoCheck: true,
  showAnswerReview: true,
  examMode: "practice",
  levels: {
    medium: {
      duration: 15,
      pointsMultiplier: 1.5,
      questions: [
        { id: "a", text: "First?", options: [{ text: "x", isCorrect: true }, { text: "y", isCorrect: false }] },
        { id: "b", text: "Second?", options: [{ text: "p", isCorrect: false }, { text: "q", isCorrect: true }] },
      ],
    },
  },
  ...overrides,
});

// A required field's label ends in "*", and other labels contain these words, so match the whole label.
const exact = (label: string | RegExp) =>
  typeof label === "string"
    ? new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\*?$")
    : label;
const text = (label: string | RegExp) => screen.getByLabelText(exact(label)) as HTMLInputElement;
const dialogNamed = (name: RegExp) => screen.getByRole("dialog", { hidden: true, name });
const type = (label: string | RegExp, value: string) => fireEvent.change(text(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  push.mockReset();
  api.get.mockReset();
  api.create.mockReset();
  api.save.mockReset();
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

describe("the form state", () => {
  const withQuestions = () => {
    let state = blankForm();
    state = editorReducer(state, { type: "addQuestion", level: "easy", key: "k1" });
    state = editorReducer(state, { type: "addQuestion", level: "easy", key: "k2" });
    return state;
  };

  it("starts a question with four empty options and none chosen", () => {
    const [question] = withQuestions().levels.easy.questions;
    expect(question.options).toHaveLength(4);
    expect(question.options.some((o) => o.isCorrect)).toBe(false);
  });

  it("allows one correct option at a time", () => {
    let state = withQuestions();
    state = editorReducer(state, { type: "setCorrect", level: "easy", key: "k1", index: 1 });
    state = editorReducer(state, { type: "setCorrect", level: "easy", key: "k1", index: 3 });
    expect(state.levels.easy.questions[0].options.map((o) => o.isCorrect)).toEqual([false, false, false, true]);
    expect(state.levels.easy.questions[1].options.some((o) => o.isCorrect)).toBe(false);
  });

  it("keeps between two and ten options", () => {
    let state = withQuestions();
    for (let i = 0; i < 10; i++) state = editorReducer(state, { type: "addOption", level: "easy", key: "k1" });
    expect(state.levels.easy.questions[0].options).toHaveLength(10);
    for (let i = 0; i < 10; i++) state = editorReducer(state, { type: "removeOption", level: "easy", key: "k1", index: 0 });
    expect(state.levels.easy.questions[0].options).toHaveLength(2);
  });

  it("moves, duplicates (as a new question) and removes", () => {
    let state = withQuestions();
    state = editorReducer(state, { type: "editQuestion", level: "easy", key: "k1", patch: { text: "one" } });
    state = editorReducer(state, { type: "editQuestion", level: "easy", key: "k2", patch: { text: "two" } });
    state = editorReducer(state, { type: "moveQuestion", level: "easy", key: "k2", by: -1 });
    expect(state.levels.easy.questions.map((q) => q.text)).toEqual(["two", "one"]);
    // The ends don't move off the list.
    expect(editorReducer(state, { type: "moveQuestion", level: "easy", key: "k2", by: -1 })).toBe(state);

    const stored = editorReducer(state, { type: "load", form: { ...state, levels: { ...state.levels, easy: { ...state.levels.easy, questions: [{ ...state.levels.easy.questions[0], id: "saved" }, state.levels.easy.questions[1]] } } } });
    const copied = editorReducer(stored, { type: "duplicateQuestion", level: "easy", key: "k2", newKey: "k3" });
    expect(copied.levels.easy.questions.map((q) => q.key)).toEqual(["k2", "k3", "k1"]);
    expect(copied.levels.easy.questions[1]).not.toHaveProperty("id");
    expect(copied.levels.easy.questions[0].id).toBe("saved");

    expect(editorReducer(copied, { type: "removeQuestion", level: "easy", key: "k3" }).levels.easy.questions).toHaveLength(2);
  });

  it("imports after or instead of what's there", () => {
    const state = withQuestions();
    const incoming = [draftQuestion({ text: "new", options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] })];
    expect(editorReducer(state, { type: "importQuestions", level: "easy", questions: incoming, mode: "append" }).levels.easy.questions).toHaveLength(3);
    expect(editorReducer(state, { type: "importQuestions", level: "easy", questions: incoming, mode: "replace" }).levels.easy.questions.map((q) => q.text)).toEqual(["new"]);
  });

  it("turns typed numbers into numbers, and a blank one into a validation error", () => {
    let state = blankForm();
    state = editorReducer(state, { type: "field", name: "title", value: "T" });
    state = editorReducer(state, { type: "addQuestion", level: "easy", key: "k1" });
    state = editorReducer(state, { type: "editQuestion", level: "easy", key: "k1", patch: { text: "Q" } });
    state = editorReducer(state, { type: "optionText", level: "easy", key: "k1", index: 0, value: "a" });
    state = editorReducer(state, { type: "optionText", level: "easy", key: "k1", index: 1, value: "b" });
    state = editorReducer(state, { type: "optionText", level: "easy", key: "k1", index: 2, value: "c" });
    state = editorReducer(state, { type: "optionText", level: "easy", key: "k1", index: 3, value: "d" });
    state = editorReducer(state, { type: "setCorrect", level: "easy", key: "k1", index: 2 });

    const ok = validateForm(state);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toMatchObject({ duration: 30, levels: { easy: { duration: 30, pointsMultiplier: 1 } } });

    const blank = validateForm(editorReducer(state, { type: "levelField", level: "easy", name: "duration", value: "" }));
    expect(blank.ok).toBe(false);
  });

  it("tells a changed form from an unchanged one", () => {
    const state = blankForm();
    expect(snapshotOf(state)).toBe(snapshotOf(blankForm()));
    expect(snapshotOf(editorReducer(state, { type: "field", name: "title", value: "x" }))).not.toBe(snapshotOf(state));
  });
});

describe("creating a quiz", () => {
  it("refuses an empty quiz, in words, and sends nothing", () => {
    renderEditor();
    click("Create quiz");
    const alert = screen.getByText("Fix these before saving").closest("[role=alert]") as HTMLElement;
    expect(alert).toBeTruthy();
    expect(within(alert).getByText("Give the quiz a title.")).toBeTruthy();
    expect(within(alert).getByText("Add at least one question.")).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("points at the question that is wrong", () => {
    renderEditor();
    type("Title", "Quiz");
    click("Add easy question");
    click("Create quiz");
    expect(screen.getAllByText(/Easy · Question 1: write the question\./).length).toBeGreaterThan(0);
    expect(api.create).not.toHaveBeenCalled();
  });

  it("sends the quiz as filled in and goes back to the list", async () => {
    api.create.mockResolvedValue({ id: "new1", version: 5, accessCode: "NEWCODE" });
    renderEditor();
    type("Title", "  My quiz ");
    type("Description", "About");
    click("Add easy question");
    type("Question", "What is 2 + 2?");
    for (const [i, value] of ["3", "4", "5", "6"].entries()) type(`Option ${i + 1}`, value);
    fireEvent.click(screen.getByLabelText(exact("Option 2 is the correct answer")));

    click("Create quiz");
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    const sent = api.create.mock.calls[0][0] as QuizInput;
    expect(sent).toMatchObject({
      title: "My quiz",
      description: "About",
      duration: 30,
      requiresAccessCode: false,
      isPublic: true,
      active: true,
      examMode: "practice",
    });
    expect(sent.levels.easy?.questions).toEqual([
      {
        text: "What is 2 + 2?",
        options: [
          { text: "3", isCorrect: false },
          { text: "4", isCorrect: true },
          { text: "5", isCorrect: false },
          { text: "6", isCorrect: false },
        ],
      },
    ]);
    // The other levels have no questions, so they are left out.
    expect(sent.levels.medium).toBeUndefined();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/quizzes"));
  });

  it("shows a server refusal and keeps what was typed", async () => {
    api.create.mockRejectedValue(new ApiRequestError(409, "access_code_taken", "Another quiz already uses that access code."));
    renderEditor();
    type("Title", "Quiz");
    click("Add easy question");
    type("Question", "Q?");
    for (const [i, value] of ["a", "b", "c", "d"].entries()) type(`Option ${i + 1}`, value);
    fireEvent.click(screen.getByLabelText(exact("Option 1 is the correct answer")));
    click("Create quiz");

    expect(await screen.findByText("Another quiz already uses that access code.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(text("Title").value).toBe("Quiz");
    // Can try again.
    expect((screen.getByRole("button", { name: "Create quiz" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not send twice on a double click", async () => {
    let finish: (value: unknown) => void = () => {};
    api.create.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderEditor();
    type("Title", "Quiz");
    click("Add easy question");
    type("Question", "Q?");
    for (const [i, value] of ["a", "b", "c", "d"].entries()) type(`Option ${i + 1}`, value);
    fireEvent.click(screen.getByLabelText(exact("Option 1 is the correct answer")));
    click("Create quiz");
    fireEvent.submit(screen.getByRole("button", { name: "Create quiz" }).closest("form")!);
    await act(async () => finish({ id: "x", version: 1, accessCode: "CODE12" }));
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("warns before leaving with unsaved changes, and not otherwise", () => {
    renderEditor();
    const event = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(event()).toBe(false);
    type("Title", "Changed");
    expect(event()).toBe(true);
    expect(screen.getByText("Unsaved changes")).toBeTruthy();

    click("Cancel");
    expect(dialogNamed(/Discard your changes/).hasAttribute("open")).toBe(true);
    expect(push).not.toHaveBeenCalled();
    click("Discard changes");
    expect(push).toHaveBeenCalledWith("/quizzes");
  });
});

describe("editing a quiz", () => {
  it("opens with the saved values, on the first level that has questions", async () => {
    api.get.mockResolvedValue(detail());
    renderEditor({ mode: "edit", quizId: "quiz1" });
    expect(await screen.findByDisplayValue("Existing quiz")).toBeTruthy();
    expect(text("Access code").value).toBe("ABC123");
    expect(text("Medium time limit (minutes)").value).toBe("15");
    expect(text("Medium points multiplier").value).toBe("1.5");
    expect(screen.getAllByLabelText(exact("Question"))).toHaveLength(2);
    expect((screen.getAllByLabelText(exact("Option 1 is the correct answer"))[0] as HTMLInputElement).checked).toBe(true);
    // Nothing changed yet: no warning.
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(api.get).toHaveBeenCalledWith("quiz1");
  });

  it("saves with the version it opened and keeps the question ids", async () => {
    api.get.mockResolvedValue(detail());
    api.save.mockResolvedValue({ version: 2000, accessCode: "ABC123" });
    renderEditor({ mode: "edit", quizId: "quiz1" });
    await screen.findByDisplayValue("Existing quiz");

    type("Title", "Renamed");
    click("Save changes");
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const [id, input, version] = api.save.mock.calls[0] as [string, QuizInput, number];
    expect(id).toBe("quiz1");
    expect(version).toBe(1000);
    expect(input.title).toBe("Renamed");
    expect(input.levels.medium?.questions.map((q) => q.id)).toEqual(["a", "b"]);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/quizzes"));
  });

  it("says when someone else saved first, and reloading shows their version", async () => {
    api.get.mockResolvedValueOnce(detail());
    api.save.mockRejectedValue(new ApiRequestError(409, "quiz_changed", "Someone else saved this quiz while you were editing. Reload it to see their changes."));
    renderEditor({ mode: "edit", quizId: "quiz1" });
    await screen.findByDisplayValue("Existing quiz");

    type("Title", "Mine");
    click("Save changes");
    expect(await screen.findByText("This quiz changed while you were editing")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();

    api.get.mockResolvedValueOnce(detail({ title: "Theirs", version: 3000 }));
    click("Reload quiz");
    expect(await screen.findByDisplayValue("Theirs")).toBeTruthy();
    expect(screen.queryByText("This quiz changed while you were editing")).toBeNull();
  });

  it("explains a quiz that can't be opened, and retries", async () => {
    api.get.mockRejectedValueOnce(new ApiRequestError(404, "quiz_not_found", "That quiz doesn't exist."));
    renderEditor({ mode: "edit", quizId: "gone" });
    expect(await screen.findByText("That quiz doesn't exist. It may have been deleted.")).toBeTruthy();

    api.get.mockResolvedValueOnce(detail());
    click("Try again");
    expect(await screen.findByDisplayValue("Existing quiz")).toBeTruthy();
  });

  it("imports pasted questions into the level", async () => {
    api.get.mockResolvedValue(detail());
    renderEditor({ mode: "edit", quizId: "quiz1" });
    await screen.findByDisplayValue("Existing quiz");

    click("Import");
    const dialog = dialogNamed(/Import medium questions/);
    const pasted = JSON.stringify([{ text: "Imported?", options: ["yes", "no"], correctIndex: 0 }]);
    fireEvent.change(within(dialog).getByLabelText("Questions (JSON)"), { target: { value: pasted } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import", hidden: true }));

    const questions = screen.getAllByLabelText(exact("Question")) as HTMLTextAreaElement[];
    expect(questions.map((q) => q.value)).toEqual(["First?", "Second?", "Imported?"]);
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("explains an import it can't read, and adds nothing", async () => {
    api.get.mockResolvedValue(detail());
    renderEditor({ mode: "edit", quizId: "quiz1" });
    await screen.findByDisplayValue("Existing quiz");

    click("Import");
    const dialog = dialogNamed(/Import medium questions/);
    fireEvent.change(within(dialog).getByLabelText("Questions (JSON)"), { target: { value: "not json" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import", hidden: true }));
    expect(within(dialog).getByText(/valid JSON/)).toBeTruthy();
    expect(screen.getAllByLabelText(exact("Question"))).toHaveLength(2);
  });
});
