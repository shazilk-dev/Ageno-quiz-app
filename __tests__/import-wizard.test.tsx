// @vitest-environment jsdom
// The Import page end to end in jsdom: paste, check, fix or leave out, choose where, see the plan, save.
// The admin API is mocked, so nothing here needs a server:
//   npx vitest run __tests__/import-wizard.test.tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api-client";
import type { AdminQuizDetail, AdminQuizSummary } from "@/lib/quiz-schema";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/admin-api", () => ({ adminQuizzes: api }));

import { ImportWizard } from "@/components/admin/quiz-import/ImportWizard";
import { ToastProvider } from "@/components/ui";

const GOOD = {
  format: "ageno-quiz",
  version: 1,
  quiz: { title: "From an AI", duration: 15 },
  levels: {
    easy: {
      duration: 10,
      questions: [
        { text: "Which protocol encrypts web traffic?", options: [{ text: "HTTP", isCorrect: false }, { text: "HTTPS", isCorrect: true }] },
        {
          type: "multiple",
          text: "Pick the primes",
          options: [{ text: "2", isCorrect: true }, { text: "4", isCorrect: false }, { text: "3", isCorrect: true }],
          note: "Answer inferred, please check.",
        },
      ],
    },
  },
};
const WITH_A_BAD_ROW = {
  ...GOOD,
  levels: {
    easy: {
      questions: [...GOOD.levels.easy.questions, { text: "", options: [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }] }],
    },
  },
};

const summary = (overrides: Partial<AdminQuizSummary> = {}): AdminQuizSummary => ({
  id: "quiz1",
  title: "Existing quiz",
  description: "",
  accessCode: "ABC123",
  requiresAccessCode: true,
  isPublic: true,
  active: true,
  isAutoCheck: true,
  examMode: "practice",
  duration: 20,
  counts: { easy: 2 },
  responseCount: 0,
  createdAt: 1,
  deletedAt: null,
  ...overrides,
});

const stored = (id: string, text: string) => ({
  id,
  type: "single" as const,
  text,
  options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }],
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
  requiresAccessCode: true,
  isPublic: true,
  active: true,
  isAutoCheck: true,
  showAnswerReview: true,
  examMode: "practice",
  levels: { easy: { duration: 12, pointsMultiplier: 1, questions: [stored("s1", "Old one"), stored("s2", "Old two")] } },
  ...overrides,
});

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const click = (name: string | RegExp) => fireEvent.click(button(name));
const paste = (text: string) => {
  fireEvent.change(screen.getByLabelText("Paste here"), { target: { value: text } });
  click("Check the questions");
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.list.mockResolvedValue([summary()]);
  api.get.mockResolvedValue(detail());
  api.create.mockResolvedValue({ id: "new1", version: 5, accessCode: "NEW777" });
  api.save.mockResolvedValue({ version: 2000, accessCode: "ABC123" });
});
afterEach(() => cleanup());

const open = () =>
  render(
    <ToastProvider>
      <ImportWizard />
    </ToastProvider>
  );

describe("the Import page", () => {
  it("starts with the three ways in and checks nothing until asked", () => {
    open();
    expect(screen.getByRole("heading", { name: "Import" })).toBeTruthy();
    expect(screen.getByLabelText("JSON")).toBeTruthy();
    expect(screen.getByLabelText("Sheet / CSV")).toBeTruthy();
    expect(screen.getByLabelText("Text")).toBeTruthy();
    expect(button("Check the questions")).toHaveProperty("disabled", true);
  });

  it("shows what was found, with the AI's note highlighted, then creates a closed quiz", async () => {
    open();
    paste(JSON.stringify(GOOD));

    expect(screen.getByText("2 questions: all ready, 1 with a warning")).toBeTruthy();
    expect(screen.getByText("Answer inferred, please check.")).toBeTruthy();
    expect(screen.getByText("Note in the file")).toBeTruthy();

    click("Continue with 2 questions");
    expect(screen.getByDisplayValue("From an AI")).toBeTruthy();
    expect(screen.getByText(/2 new · 0 → 2 questions/)).toBeTruthy();
    click("Create the quiz");

    expect(await screen.findByText(/"From an AI" is ready/)).toBeTruthy();
    const sent = api.create.mock.calls[0][0];
    expect(sent).toMatchObject({ title: "From an AI", active: false, accessCode: "", duration: 15 });
    expect(sent.levels.easy).toMatchObject({ duration: 10 });
    expect(sent.levels.easy.questions.map((q: { text: string; type: string }) => [q.text, q.type])).toEqual([
      ["Which protocol encrypts web traffic?", "single"],
      ["Pick the primes", "multiple"],
    ]);
    expect(screen.getByText("NEW777")).toBeTruthy();
    expect(screen.getByText(/It is closed/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Look at the quiz" }).getAttribute("href")).toBe("/quizzes/new1");
  });

  it("opens the quiz to players only when asked", async () => {
    open();
    paste(JSON.stringify(GOOD));
    click("Continue with 2 questions");
    fireEvent.click(screen.getByLabelText(/Open it to players right away/));
    click("Create the quiz");
    await screen.findByText(/"From an AI" is ready/);
    expect(api.create.mock.calls[0][0].active).toBe(true);
    expect(screen.getByText(/Players can start it now/)).toBeTruthy();
  });

  it("needs a title for a new quiz", () => {
    open();
    paste(JSON.stringify({ ...GOOD, quiz: undefined }));
    click("Continue with 2 questions");
    expect(button("Create the quiz")).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Typed here" } });
    expect(button("Create the quiz")).toHaveProperty("disabled", false);
  });

  it("names the row with the problem, imports the others, and lets the admin fix it", async () => {
    open();
    paste(JSON.stringify(WITH_A_BAD_ROW));

    expect(screen.getByText("3 questions: 2 ready, 1 needs fixing (Easy · question 3)")).toBeTruthy();
    expect(screen.getByText(/Write the question/)).toBeTruthy();
    expect(button("Continue with 2 questions")).toBeTruthy();

    // Fix it in place with the editor's own question card.
    const rows = screen.getAllByRole("listitem").filter((item) => within(item).queryByText("Needs fixing"));
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Edit" }));
    const questionBox = within(rows[0]).getByLabelText(/^Question/) as HTMLTextAreaElement;
    fireEvent.change(questionBox, { target: { value: "Now it has text" } });
    fireEvent.click(within(rows[0]).getByRole("radio", { name: "Option 2 is the correct answer" }));
    expect(screen.getByText("3 questions: all ready, 1 with a warning")).toBeTruthy();
    expect(button("Continue with 3 questions")).toBeTruthy();
  });

  it("leaves a row out on request", () => {
    open();
    paste(JSON.stringify(GOOD));
    const first = screen.getAllByRole("button", { name: "Leave out" })[0];
    fireEvent.click(first);
    expect(screen.getByText("1 question: all ready, 1 with a warning")).toBeTruthy();
    expect(button("Continue with 1 question")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Include" }));
    expect(button("Continue with 2 questions")).toBeTruthy();
  });

  it("says why nothing can be imported", () => {
    open();
    paste("{ nope");
    expect(screen.getByText(/isn't valid JSON/)).toBeTruthy();
    expect(button(/Continue with 0 questions/)).toHaveProperty("disabled", true);
  });

  it("reads rows pasted from a spreadsheet, and sends the questions with no level to the level chosen", async () => {
    open();
    paste("question\toption_a\toption_b\tcorrect\nWhat is 2+2?\t3\t4\tB\nName a prime\t2\t4\tA");
    expect(screen.getByText("2 questions: all ready")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Questions with no level go to/), { target: { value: "hard" } });
    click("Continue with 2 questions");
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Sheet quiz" } });
    click("Create the quiz");
    await screen.findByText(/"Sheet quiz" is ready/);
    const sent = api.create.mock.calls[0][0];
    expect(Object.keys(sent.levels)).toEqual(["hard"]);
    expect(sent.levels.hard.questions).toHaveLength(2);
  });

  describe("into a quiz that exists", () => {
    const toPlan = async (file: unknown) => {
      open();
      paste(JSON.stringify(file));
      click(/^Continue with/);
      fireEvent.click(screen.getByLabelText("A quiz I have"));
      await waitFor(() => expect(screen.getByRole("option", { name: "Existing quiz" })).toBeTruthy());
      fireEvent.change(screen.getByLabelText("Quiz"), { target: { value: "quiz1" } });
      await screen.findByText("Add");
    };

    it("adds after what is there and says what changes", async () => {
      await toPlan(GOOD);
      expect(screen.getByText(/2 new, 2 unchanged · 2 → 4 questions/)).toBeTruthy();
      click("Import into the quiz");
      await screen.findByText(/"Existing quiz" updated/);
      const [id, input, version] = api.save.mock.calls[0];
      expect(id).toBe("quiz1");
      expect(version).toBe(1000);
      expect(input.title).toBe("Existing quiz");
      expect(input.accessCode).toBe("ABC123");
      expect(input.levels.easy.duration).toBe(12);
      expect(input.levels.easy.questions.map((q: { text: string }) => q.text)).toEqual([
        "Old one",
        "Old two",
        "Which protocol encrypts web traffic?",
        "Pick the primes",
      ]);
      expect(api.create).not.toHaveBeenCalled();
    });

    it("replaces a level, counting what goes", async () => {
      await toPlan(GOOD);
      fireEvent.click(screen.getByLabelText(/Replace/));
      expect(screen.getByText(/2 new, 2 removed · 2 → 2 questions/)).toBeTruthy();
    });

    it("updates by id: changed questions change, nothing else is touched", async () => {
      const edited = { text: "Old one, reworded", id: "s1", options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] };
      await toPlan({ ...GOOD, levels: { easy: { questions: [edited] } } });
      fireEvent.click(screen.getByLabelText(/Update/));
      expect(screen.getByText(/1 changed, 1 unchanged · 2 → 2 questions/)).toBeTruthy();
    });

    it("warns about warnings against the level's own questions", async () => {
      open();
      paste(JSON.stringify({ ...GOOD, levels: { easy: { questions: [{ text: "old one", options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] }] } } }));
      click(/^Continue with/);
      fireEvent.click(screen.getByLabelText("A quiz I have"));
      await waitFor(() => expect(screen.getByRole("option", { name: "Existing quiz" })).toBeTruthy());
      fireEvent.change(screen.getByLabelText("Quiz"), { target: { value: "quiz1" } });
      await screen.findByText("Add");
      click("Back to the questions");
      expect(screen.getByText(/this question is already in the level/i)).toBeTruthy();
    });

    it("says when the quiz changed under the admin, and reloads it on request", async () => {
      await toPlan(GOOD);
      api.save.mockRejectedValueOnce(new ApiRequestError(409, "quiz_changed", "Someone else saved this quiz."));
      click("Import into the quiz");
      expect(await screen.findByText("Someone else saved this quiz.", { exact: false })).toBeTruthy();
      api.get.mockResolvedValueOnce(detail({ version: 3000 }));
      click("Reload the quiz");
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
      click("Import into the quiz");
      await screen.findByText(/"Existing quiz" updated/);
      expect(api.save.mock.calls[1][2]).toBe(3000);
    });

    it("offers to retry or put the quiz back when a large update stops half way", async () => {
      await toPlan(GOOD);
      api.save.mockRejectedValueOnce(new ApiRequestError(500, "update_interrupted", "Part of the update was applied."));
      click("Import into the quiz");
      expect(await screen.findByText("The update didn't finish")).toBeTruthy();
      click("Put it back as it was");
      await screen.findByText(/back as it was/);
      const undone = api.save.mock.calls[1][1];
      expect(undone.levels.easy.questions.map((q: { text: string }) => q.text)).toEqual(["Old one", "Old two"]);
    });

    it("skips trashed quizzes in the list", async () => {
      api.list.mockResolvedValue([summary(), summary({ id: "gone", title: "In the bin", deletedAt: 5 })]);
      open();
      paste(JSON.stringify(GOOD));
      click(/^Continue with/);
      fireEvent.click(screen.getByLabelText("A quiz I have"));
      await waitFor(() => expect(screen.getByRole("option", { name: "Existing quiz" })).toBeTruthy());
      expect(screen.queryByRole("option", { name: "In the bin" })).toBeNull();
    });
  });
});
