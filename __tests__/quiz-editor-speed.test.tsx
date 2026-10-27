// @vitest-environment jsdom
// The editor's speed tools (A3), through the real screen: the draft kept on the device, the grid (typing,
// arrow keys, pasting rows), copy / move / delete with undo, the checks panel and the player preview.
// The admin API is mocked.   npx vitest run __tests__/quiz-editor-speed.test.tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import type { AdminQuizDetail } from "@/lib/quiz-schema";

// These render the whole editor and the machine may be busy; give each test room.
vi.setConfig({ testTimeout: 20_000 });

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const api = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), save: vi.fn() }));
const images = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/admin-api", () => ({ adminQuizzes: api, adminImages: images }));

import { QuizEditor } from "@/components/admin/quiz-editor/QuizEditor";
import { draftKey, saveDraft } from "@/components/admin/quiz-editor/draft-storage";
import { blankForm, draftQuestion } from "@/components/admin/quiz-editor/editor-state";
import { DRAFT_DELAY_MS } from "@/components/admin/quiz-editor/useDraft";
import { ToastProvider } from "@/components/ui";

const renderEditor = (props: Parameters<typeof QuizEditor>[0] = { mode: "create" }) =>
  render(
    <ToastProvider>
      <QuizEditor {...props} />
    </ToastProvider>
  );

const question = (id: string, text: string, right = 0) => ({
  id,
  type: "single" as const,
  text,
  options: ["w", "x", "y", "z"].map((option, i) => ({ text: option, isCorrect: i === right })),
});

const detail = (overrides: Partial<AdminQuizDetail> = {}): AdminQuizDetail => ({
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
  levels: {
    easy: {
      duration: 15,
      pointsMultiplier: 1,
      questions: [question("a", "First?", 0), question("b", "Second?", 1), question("c", "Third?", 2)],
    },
  },
  ...overrides,
});

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const cell = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const typeInto = (label: string | RegExp, value: string) => fireEvent.change(cell(label), { target: { value } });

beforeEach(() => {
  window.localStorage.clear();
  push.mockReset();
  api.get.mockReset();
  api.create.mockReset();
  api.save.mockReset();
  images.upload.mockReset();
  api.get.mockResolvedValue(detail());
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

const openGrid = async () => {
  renderEditor({ mode: "edit", quizId: "quiz1" });
  await screen.findByText("Edit quiz");
  fireEvent.click(screen.getByLabelText("Grid"));
  return screen.getByRole("table");
};

describe("the draft kept on the device", () => {
  it("keeps unsaved edits shortly after typing stops, and offers them back next time", async () => {
    const first = renderEditor();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Half-written quiz" } });
    expect(await screen.findByText(/copy kept on this device/, undefined, { timeout: DRAFT_DELAY_MS + 2000 })).toBeTruthy();
    expect(window.localStorage.getItem(draftKey(null))).toContain("Half-written quiz");
    first.unmount();

    renderEditor();
    expect(await screen.findByText("You have unsaved changes from earlier")).toBeTruthy();
    // Nothing overwrites the copy while the admin decides.
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("");
    click("Restore them");
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Half-written quiz");
    expect(screen.queryByText("You have unsaved changes from earlier")).toBeNull();
  });

  it("drops the copy on Discard", async () => {
    const form = blankForm();
    form.title = "Old draft";
    saveDraft(null, form, 0);
    renderEditor();
    await screen.findByText("You have unsaved changes from earlier");
    click("Discard");
    expect(window.localStorage.getItem(draftKey(null))).toBeNull();
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("");
  });

  it("says when the quiz was saved again after the copy was made", async () => {
    const form = blankForm();
    form.title = "Existing quiz";
    form.levels.easy.questions = [draftQuestion(question("a", "Edited?"))];
    saveDraft("quiz1", form, 900);
    renderEditor({ mode: "edit", quizId: "quiz1" });
    expect(await screen.findByText(/restoring them and saving replaces those newer changes/)).toBeTruthy();
  });

  it("forgets a copy that matches what is saved, and forgets it after a successful save", async () => {
    // A copy identical to the stored quiz isn't an unsaved change.
    const same = blankForm();
    same.title = "Existing quiz";
    same.description = "";
    same.duration = "20";
    same.accessCode = "ABC123";
    same.levels.easy = {
      duration: "15",
      pointsMultiplier: "1",
      questions: [draftQuestion(question("a", "First?", 0)), draftQuestion(question("b", "Second?", 1)), draftQuestion(question("c", "Third?", 2))],
    };
    saveDraft("quiz1", same, 1000);
    renderEditor({ mode: "edit", quizId: "quiz1" });
    await screen.findByText("Edit quiz");
    await waitFor(() => expect(window.localStorage.getItem(draftKey("quiz1"))).toBeNull());
    expect(screen.queryByText("You have unsaved changes from earlier")).toBeNull();

    api.save.mockResolvedValue({ version: 2000, accessCode: "ABC123" });
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Renamed" } });
    await waitFor(() => expect(window.localStorage.getItem(draftKey("quiz1"))).toContain("Renamed"), { timeout: DRAFT_DELAY_MS + 2000 });
    click("Save changes");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/quizzes"));
    expect(window.localStorage.getItem(draftKey("quiz1"))).toBeNull();
  });

  it("works without storage: the editor still opens and says the copy couldn't be kept", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    renderEditor();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Typing" } });
    expect(await screen.findByText(/couldn't keep a copy on this device/, undefined, { timeout: DRAFT_DELAY_MS + 2000 })).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe("the grid", () => {
  it("shows a row per question and edits the draft cell by cell", async () => {
    const table = await openGrid();
    expect(within(table).getAllByRole("row")).toHaveLength(4); // header + 3
    typeInto("Question 2", "Second, fixed?");
    typeInto("Question 2, option C", "ee");
    expect(cell("Question 2").value).toBe("Second, fixed?");
    expect(cell(/Question 2, option C/).value).toBe("ee");
    // Back in the card view the same draft is there.
    fireEvent.click(screen.getByLabelText("Cards"));
    expect((screen.getByDisplayValue("Second, fixed?") as HTMLTextAreaElement).tagName).toBe("TEXTAREA");
  });

  it("marks the right option and reads the Correct column when it is left", async () => {
    await openGrid();
    expect(cell("Correct answer of question 1").value).toBe("A");
    expect(cell("Question 2, option B, correct")).toBeTruthy();
    typeInto("Correct answer of question 1", "c");
    fireEvent.blur(cell("Correct answer of question 1"));
    expect(cell("Correct answer of question 1").value).toBe("C");
    expect(cell("Question 1, option C, correct")).toBeTruthy();
    expect(screen.queryByLabelText("Question 1, option A, correct")).toBeNull();
  });

  it("keeps text it can't read in red with the reason, and changes nothing", async () => {
    await openGrid();
    typeInto("Correct answer of question 1", "H");
    fireEvent.blur(cell("Correct answer of question 1"));
    expect(screen.getByText(/names option H/)).toBeTruthy();
    expect(cell("Correct answer of question 1").getAttribute("aria-invalid")).toBe("true");
    expect(cell("Question 1, option A, correct")).toBeTruthy();
  });

  it("moves with the arrow keys and Enter, adds a row on Enter at the end, and never saves", async () => {
    await openGrid();
    const first = cell("Question 1");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell("Question 2"));
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(document.activeElement).toBe(cell("Question 3"));
    fireEvent.keyDown(document.activeElement!, { key: "Enter", shiftKey: true });
    expect(document.activeElement).toBe(cell("Question 2"));

    // Right only crosses to the next cell once the caret is at the end of the text.
    const second = cell("Question 2");
    second.setSelectionRange(0, 0);
    fireEvent.keyDown(second, { key: "ArrowRight" });
    expect(document.activeElement).toBe(second);
    second.setSelectionRange(second.value.length, second.value.length);
    fireEvent.keyDown(second, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell(/Question 2, option A/));

    const third = cell("Question 3");
    third.focus();
    fireEvent.keyDown(third, { key: "Enter" });
    await waitFor(() => expect(cell("Question 4")).toBeTruthy());
    expect(document.activeElement).toBe(cell("Question 4"));
    expect(api.save).not.toHaveBeenCalled();
  });

  it("pastes rows copied from a spreadsheet, adds the rows that are missing, and can undo it", async () => {
    await openGrid();
    const target = cell("Question 3");
    const text = ["Fourth?\tp\tq\tr\ts\tB", "Fifth?\tk\tl\tm\tn\tA, C"].join("\n") + "\n";
    fireEvent.paste(target, { clipboardData: { getData: () => text } });

    expect(cell("Question 3").value).toBe("Fourth?");
    expect(cell("Question 4").value).toBe("Fifth?");
    expect(cell("Correct answer of question 3").value).toBe("B");
    expect(cell("Correct answer of question 4").value).toBe("A, C");
    expect(cell("Type of question 4").value).toBe("multiple");
    expect(screen.getByText(/Pasted 12 cells; added 1 row\./)).toBeTruthy();

    click("Undo");
    expect(cell("Question 3").value).toBe("Third?");
    expect(screen.queryByLabelText("Question 4")).toBeNull();
  });

  it("leaves a single pasted value to the browser", async () => {
    await openGrid();
    const prevented = fireEvent.paste(cell("Question 1"), { clipboardData: { getData: () => "just a word" } });
    expect(prevented).toBe(true); // not cancelled, so the browser pastes it as usual
  });

  it("opens a row as a card, and previews it as a player", async () => {
    await openGrid();
    click("Edit question 2 as a card");
    expect(screen.getByDisplayValue("Second?").tagName).toBe("TEXTAREA");

    fireEvent.click(screen.getByLabelText("Grid"));
    click("Preview question 3 as a player");
    const dialog = screen.getByRole("dialog", { hidden: true, name: /Preview as a player/ });
    expect(within(dialog).getByText("3 of 3")).toBeTruthy();
    expect(within(dialog).getByText("Third?")).toBeTruthy();
  });
});

describe("selecting questions", () => {
  it("copies to another level as new questions, and undoes it", async () => {
    await openGrid();
    fireEvent.click(screen.getByLabelText("Select question 1"));
    fireEvent.click(screen.getByLabelText("Select question 3"));
    expect(screen.getByText("2 selected")).toBeTruthy();

    const bar = screen.getByRole("toolbar", { name: "Selected questions" });
    fireEvent.click(within(bar).getAllByRole("button", { name: "Hard" })[0]); // Copy to Hard
    expect(screen.getByText("Copied 2 questions to Hard.")).toBeTruthy();
    expect(screen.queryByText("2 selected")).toBeNull();

    click("Go to Hard");
    expect(cell("Question 1").value).toBe("First?");
    expect(cell("Question 2").value).toBe("Third?");

    click("Undo");
    expect(screen.getByText(/No hard questions yet/)).toBeTruthy();
  });

  it("moves to another level and sends the questions with no id", async () => {
    api.save.mockResolvedValue({ version: 2000, accessCode: "ABC123" });
    await openGrid();
    fireEvent.click(screen.getByLabelText("Select question 2"));
    const bar = screen.getByRole("toolbar", { name: "Selected questions" });
    const moveTo = within(bar).getAllByRole("button", { name: "Medium" });
    fireEvent.click(moveTo[moveTo.length - 1]); // Move to Medium
    expect(screen.getByText("Moved 1 question to Medium.")).toBeTruthy();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);

    click("Save changes");
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    const [, input] = api.save.mock.calls[0];
    expect(input.levels.easy.questions.map((item: { text: string }) => item.text)).toEqual(["First?", "Third?"]);
    expect(input.levels.medium.questions).toHaveLength(1);
    expect(input.levels.medium.questions[0]).toMatchObject({ text: "Second?" });
    expect(input.levels.medium.questions[0].id).toBeUndefined();
  });

  it("deletes the selected questions and can bring them back", async () => {
    await openGrid();
    fireEvent.click(screen.getByLabelText("Select every question in this level"));
    expect(screen.getByText("3 selected")).toBeTruthy();
    click("Delete");
    expect(screen.getByText("Deleted 3 questions.")).toBeTruthy();
    expect(screen.getByText(/No easy questions yet/)).toBeTruthy();
    click("Undo");
    expect(cell("Question 3").value).toBe("Third?");
  });

  it("selects from the card view too", async () => {
    renderEditor({ mode: "edit", quizId: "quiz1" });
    await screen.findByText("Edit quiz");
    fireEvent.click(screen.getByLabelText("Select question 2"));
    expect(screen.getByText("1 selected")).toBeTruthy();
    click("Clear selection");
    expect(screen.queryByText("1 selected")).toBeNull();
  });
});

describe("the checks panel", () => {
  it("is quiet for a tidy quiz and lists what looks careless otherwise", async () => {
    api.get.mockResolvedValue(
      detail({
        levels: {
          easy: {
            duration: 15,
            pointsMultiplier: 1,
            questions: [question("a", "Same?"), question("b", "same"), question("c", "Other?")],
          },
        },
      })
    );
    renderEditor({ mode: "edit", quizId: "quiz1" });
    await screen.findByText("Edit quiz");
    expect(screen.getByText(/to look at/)).toBeTruthy();
    const summary = screen.getByText("Checks").closest("details")!;
    const entry = within(summary).getByText("Same question as Easy · Question 1.");
    fireEvent.click(entry);
    // Jumping to it focuses the repeated question's text.
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByDisplayValue("same")[0]));
  });

  it("says so when there is nothing to look at", async () => {
    api.get.mockResolvedValue(
      detail({
        levels: {
          easy: {
            duration: 15,
            pointsMultiplier: 1,
            questions: [{ ...question("a", "Only one?"), explanation: "Because." }],
          },
        },
      })
    );
    renderEditor({ mode: "edit", quizId: "quiz1" });
    await screen.findByText("Edit quiz");
    expect(screen.getByText("nothing to look at")).toBeTruthy();
  });
});

describe("Enter in a text box", () => {
  it("does not save the quiz from the card view either", async () => {
    renderEditor({ mode: "edit", quizId: "quiz1" });
    await screen.findByText("Edit quiz");
    const title = screen.getByLabelText(/^Title/);
    const notCancelled = fireEvent.keyDown(title, { key: "Enter" });
    expect(notCancelled).toBe(false); // the page cancelled it, so the form is not submitted
    expect(api.save).not.toHaveBeenCalled();
  });
});

describe("a question's picture", () => {
  const openExtras = async () => {
    renderEditor({ mode: "edit", quizId: "quiz1" });
    await screen.findByText("Edit quiz");
  };
  const pick = (file: File) => {
    const input = screen.getAllByLabelText("Choose a picture to upload")[0] as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  };
  const png = (name = "map.png", size = 1000) => {
    const file = new File(["x"], name, { type: "image/png" });
    Object.defineProperty(file, "size", { value: size });
    return file;
  };

  it("uploads a picture through the server and puts its address in the question, with a preview", async () => {
    images.upload.mockResolvedValue({ url: "https://firebasestorage.googleapis.com/v0/b/x/o/p.png?alt=media&token=t" });
    await openExtras();
    pick(png());
    await waitFor(() =>
      expect((screen.getAllByLabelText(/^Image/)[0] as HTMLInputElement).value).toBe(
        "https://firebasestorage.googleapis.com/v0/b/x/o/p.png?alt=media&token=t"
      )
    );
    expect(images.upload).toHaveBeenCalledTimes(1);
    expect(screen.getAllByAltText("The picture as players will see it")).toHaveLength(1);

    click("Remove the picture");
    expect((screen.getAllByLabelText(/^Image/)[0] as HTMLInputElement).value).toBe("");
  });

  it("refuses the wrong kind or size in the browser, and shows the server's refusal", async () => {
    await openExtras();
    pick(new File(["%PDF"], "notes.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Choose a PNG, JPEG, WebP or GIF picture.")).toBeTruthy();
    pick(png("huge.png", 5 * 1024 * 1024));
    expect(await screen.findByText(/The most is 2 MB/)).toBeTruthy();
    expect(images.upload).not.toHaveBeenCalled();

    images.upload.mockRejectedValue(new ApiRequestError(503, "image_storage_unavailable", "Image storage isn't set up for this project yet."));
    pick(png());
    expect(await screen.findByText("Image storage isn't set up for this project yet.")).toBeTruthy();
    expect((screen.getAllByLabelText(/^Image/)[0] as HTMLInputElement).value).toBe("");
  });
});
