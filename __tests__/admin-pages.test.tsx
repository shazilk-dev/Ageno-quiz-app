// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserDTO, ReportRow } from "@/lib/admin-types";

const api = vi.hoisted(() => ({
  users: { list: vi.fn(), setRole: vi.fn(), remove: vi.fn() },
  reports: { page: vi.fn(), dashboard: vi.fn() },
  quizzes: { list: vi.fn(), get: vi.fn(), create: vi.fn(), trash: vi.fn(), restore: vi.fn(), deleteForever: vi.fn() },
}));
vi.mock("@/lib/admin-api", () => ({
  adminUsers: api.users,
  adminReports: api.reports,
  adminQuizzes: api.quizzes,
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/Toast")>()),
  useToast: () => ({ toast }),
}));
// A stable object, like the real context.
const auth = { user: { uid: "me" }, loading: false, isAdmin: true };
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => auth }));

import QuizReportsPage from "@/app/(admin)/quiz-reports/ReportsClient";
import QuizzesPage from "@/app/(admin)/quizzes/QuizzesClient";
import UsersPage from "@/app/(admin)/users/UsersClient";
import type { AdminQuizSummary } from "@/lib/quiz-schema";

const person = (over: Partial<AdminUserDTO>): AdminUserDTO => ({
  id: "u",
  email: "u@example.com",
  displayName: "Someone",
  role: "user",
  emailVerified: true,
  createdAt: 1_000,
  lastLoginAt: null,
  ...over,
});
const result = (over: Partial<ReportRow>): ReportRow => ({
  id: "r",
  quizId: "q1",
  quizTitle: "Networking",
  userId: "u",
  userName: "Ada",
  score: 80,
  startedAt: 0,
  submittedAt: 120_000,
  tabSwitchCount: 0,
  fullscreenExits: 0,
  blurCount: 0,
  difficulty: "medium",
  ...over,
});

beforeEach(() => {
  for (const group of [api.users, api.reports, api.quizzes]) Object.values(group).forEach((fn) => fn.mockReset());
  toast.mockReset();
  push.mockReset();
  // jsdom has no modal <dialog>; mimic what showModal and close do to `open`.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

describe("Users page", () => {
  const people = [
    person({ id: "me", displayName: "Me Admin", role: "admin", createdAt: 3_000 }),
    person({ id: "u2", displayName: "Grace", createdAt: 2_000 }),
    person({ id: "u3", displayName: "Linus", emailVerified: false, createdAt: 1_000 }),
  ];

  it("links each person to their results", async () => {
    api.users.list.mockResolvedValue({ users: people, total: 3 });
    render(<UsersPage />);
    const link = await screen.findByRole("link", { name: "Results: Grace" });
    expect(link.getAttribute("href")).toBe("/quiz-reports?userId=u2");
  });

  it("lists people with no controls on your own row and no dead invite button", async () => {
    api.users.list.mockResolvedValue({ users: people, total: 3 });
    render(<UsersPage />);

    await screen.findByText("Grace");
    expect(screen.getByRole("button", { name: /Make member: Me Admin/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Delete Me Admin" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /Make admin: Grace/ }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Unverified")).toBeTruthy();
    expect(screen.queryByText(/Invite/)).toBeNull();
  });

  it("asks before changing a role, then does it and updates the row", async () => {
    api.users.list.mockResolvedValue({ users: people, total: 3 });
    api.users.setRole.mockResolvedValue({ id: "u2", role: "admin" });
    render(<UsersPage />);
    await screen.findByText("Grace");

    fireEvent.click(screen.getByRole("button", { name: /Make admin: Grace/ }));
    const dialog = await screen.findByRole("dialog");
    expect(api.users.setRole).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Make admin" }));

    await waitFor(() => expect(api.users.setRole).toHaveBeenCalledWith("u2", "admin"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Make member: Grace/ })).toBeTruthy());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Admin added", variant: "success" }));
  });

  it("shows the server's reason inside the dialog when a change is refused", async () => {
    api.users.list.mockResolvedValue({ users: people, total: 3 });
    const { ApiRequestError } = await import("@/lib/api-client");
    api.users.setRole.mockRejectedValue(new ApiRequestError(400, "x", "Ask another admin."));
    render(<UsersPage />);
    await screen.findByText("Grace");

    fireEvent.click(screen.getByRole("button", { name: /Make admin: Grace/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Make admin" }));

    expect((await screen.findByText("Ask another admin.")).closest("[role=alert]")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Make admin: Grace/ })).toBeTruthy();
  });

  it("searches, filters by role, and offers a way back from an empty result", async () => {
    api.users.list.mockResolvedValue({ users: people, total: 3 });
    render(<UsersPage />);
    await screen.findByText("Grace");

    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "linus" } });
    expect(screen.queryByText("Grace")).toBeNull();
    expect(screen.getByText("Linus")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Admins/ }));
    expect(await screen.findByText("No one matches")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search and filter" }));
    expect(await screen.findByText("Grace")).toBeTruthy();
  });

  it("sorts by a column and says how", async () => {
    api.users.list.mockResolvedValue({ users: people, total: 3 });
    render(<UsersPage />);
    await screen.findByText("Grace");

    const names = () =>
      screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
    fireEvent.click(screen.getByRole("button", { name: "Person" }));
    expect(names()[0]).toContain("Grace");
    expect(screen.getByRole("columnheader", { name: /Person/ }).getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(screen.getByRole("button", { name: "Person" }));
    expect(names()[0]).toContain("Me Admin");
  });

  it("says when only some people are listed, and has a Retry on failure", async () => {
    api.users.list.mockRejectedValueOnce(new Error("boom"));
    api.users.list.mockResolvedValueOnce({ users: people, total: 900 });
    render(<UsersPage />);

    expect(await screen.findByText("Couldn't load the users")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Showing the 3 newest of 900/)).toBeTruthy();
  });
});

describe("Reports page", () => {
  const page = (rows: ReportRow[], nextCursor: string | null = null, total = rows.length) => ({
    rows,
    nextCursor,
    total,
    quizzes: [{ id: "q1", title: "Networking" }],
  });

  it("summarises the loaded results, counting a 0% score", async () => {
    api.reports.page.mockResolvedValue(page([result({ id: "a", score: 0 }), result({ id: "b", score: 100 })]));
    render(<QuizReportsPage />);

    expect(await screen.findByText("Average score")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Export CSV/ }).hasAttribute("disabled")).toBe(false);
  });

  it("loads older results and says the numbers cover only what is loaded", async () => {
    api.reports.page.mockResolvedValueOnce(page([result({ id: "a" })], "next", 5));
    api.reports.page.mockResolvedValueOnce(page([result({ id: "b" })], null, 5));
    render(<QuizReportsPage />);

    expect(await screen.findByText(/cover the 1 most recent of 5/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load older results" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    expect(api.reports.page).toHaveBeenLastCalledWith({ cursor: "next", quizId: undefined });
  });

  it("asks the server for one quiz when it is picked", async () => {
    api.reports.page.mockResolvedValue(page([result({})]));
    render(<QuizReportsPage />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Quiz"), { target: { value: "q1" } });
    await waitFor(() => expect(api.reports.page).toHaveBeenLastCalledWith({ quizId: "q1" }));
  });

  it("has an empty state with the export switched off, and a Retry on failure", async () => {
    api.reports.page.mockResolvedValueOnce(page([]));
    const view = render(<QuizReportsPage />);
    expect(await screen.findByText("No results yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Export CSV/ }).hasAttribute("disabled")).toBe(true);
    view.unmount();

    api.reports.page.mockRejectedValueOnce(new Error("boom"));
    api.reports.page.mockResolvedValueOnce(page([result({})]));
    render(<QuizReportsPage />);
    expect(await screen.findByText("Couldn't load the reports")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeTruthy();
  });
});

describe("Admin pages rendered with their data", () => {
  it("show the server's first screen without asking the API again", async () => {
    const users = render(<UsersPage initial={{ users: [person({ id: "u9", displayName: "Server Ada" })], total: 1 }} />);
    expect(screen.getAllByText("Server Ada").length).toBeGreaterThan(0);
    expect(api.users.list).not.toHaveBeenCalled();
    users.unmount();

    render(
      <QuizReportsPage
        initial={{ rows: [result({ id: "r9", userName: "Server Grace" })], quizzes: [{ id: "q1", title: "Networking" }], nextCursor: null, total: 1, person: null }}
      />
    );
    expect(screen.getAllByText("Server Grace").length).toBeGreaterThan(0);
    expect(api.reports.page).not.toHaveBeenCalled();
  });

  it("still asks the API when a quiz filter is picked on a server-rendered reports page", async () => {
    api.reports.page.mockResolvedValue({ rows: [], quizzes: [{ id: "q1", title: "Networking" }], nextCursor: null, total: 0, person: null });
    render(
      <QuizReportsPage
        initial={{ rows: [result({ id: "r9" })], quizzes: [{ id: "q1", title: "Networking" }], nextCursor: null, total: 1, person: null }}
      />
    );
    fireEvent.change(screen.getByLabelText("Quiz"), { target: { value: "q1" } });
    await waitFor(() => expect(api.reports.page).toHaveBeenCalledWith({ quizId: "q1" }));
  });

  it("shows one person's results, names them, and leaves the quiz filter off", async () => {
    api.reports.page.mockResolvedValue({
      rows: [],
      quizzes: [{ id: "q1", title: "Networking" }],
      nextCursor: "r1",
      total: 3,
      person: { id: "u7", name: "Grace Hopper" },
    });
    render(<QuizReportsPage userId="u7" />);
    await waitFor(() => expect(api.reports.page).toHaveBeenCalledWith({ quizId: undefined, userId: "u7" }));
    expect(screen.getByText(/Every finished quiz by Grace Hopper/)).toBeTruthy();
    expect((screen.getByLabelText("Quiz") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: /All results/ }).getAttribute("href")).toBe("/quiz-reports");
  });
});

describe("Quizzes page and the trash", () => {
  const quiz = (over: Partial<AdminQuizSummary>): AdminQuizSummary => ({
    id: "q",
    title: "Networking",
    description: "",
    accessCode: "ABC123",
    requiresAccessCode: true,
    isPublic: true,
    active: true,
    isAutoCheck: true,
    examMode: "practice",
    duration: 20,
    counts: { easy: 4 },
    responseCount: 7,
    createdAt: 1_000,
    deletedAt: null,
    ...over,
  });
  const list = [quiz({ id: "a", title: "Networking" }), quiz({ id: "b", title: "Old exam", deletedAt: 5_000, responseCount: 3 })];

  it("shows quizzes in use, with the trashed ones under their own tab", async () => {
    render(<QuizzesPage initial={list} />);
    expect(screen.getByText("Networking")).toBeTruthy();
    expect(screen.queryByText("Old exam")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Trash/ }));
    expect(screen.getByText("Old exam")).toBeTruthy();
    expect(screen.queryByText("Networking")).toBeNull();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });

  it("duplicates a quiz as a closed copy with no question ids, and opens it for editing", async () => {
    api.quizzes.get.mockResolvedValue({
      id: "a",
      version: 5,
      createdAt: 1,
      createdBy: "root",
      responseCount: 7,
      title: "Networking",
      description: "About it",
      duration: 20,
      accessCode: "ABC123",
      requiresAccessCode: true,
      isPublic: true,
      active: true,
      isAutoCheck: true,
      showAnswerReview: true,
      examMode: "strict",
      levels: {
        easy: {
          duration: 10,
          pointsMultiplier: 1,
          questions: [{ id: "q1", type: "single", text: "Q?", options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] }],
        },
      },
    });
    api.quizzes.create.mockResolvedValue({ id: "copy1", version: 1, accessCode: "ZZZ999" });
    render(<QuizzesPage initial={list} />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Networking" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/quizzes/copy1/edit"));
    const [sent] = api.quizzes.create.mock.calls[0];
    expect(sent).toMatchObject({ title: "Copy of Networking", accessCode: "", active: false, examMode: "strict", requiresAccessCode: true });
    expect(sent.levels.easy.questions[0].id).toBeUndefined();
    expect(sent).not.toHaveProperty("id");
    expect(sent).not.toHaveProperty("version");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Quiz duplicated" }));
  });

  it("says when a duplicate can't be made and stays on the list", async () => {
    api.quizzes.get.mockRejectedValue(new Error("offline"));
    render(<QuizzesPage initial={list} />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Networking" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't duplicate the quiz", variant: "error" })));
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Duplicate Networking" }) as HTMLButtonElement).getAttribute("aria-disabled")).not.toBe("true");
  });

  it("moves a quiz to the trash without deleting anything, and says what is kept", async () => {
    api.quizzes.trash.mockResolvedValue({ responseCount: 7 });
    render(<QuizzesPage initial={list} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Its 4 questions and 7 results are kept/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Move to trash" }));

    await waitFor(() => expect(api.quizzes.trash).toHaveBeenCalledWith("a"));
    await waitFor(() => expect(screen.queryByText("Networking")).toBeNull());
    expect(api.quizzes.deleteForever).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved to the trash" }));
  });

  it("restores a quiz from the trash", async () => {
    api.quizzes.restore.mockResolvedValue({ restored: true });
    render(<QuizzesPage initial={list} />);
    fireEvent.click(screen.getByRole("button", { name: /Trash/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(api.quizzes.restore).toHaveBeenCalledWith("b"));
    await waitFor(() => expect(screen.queryByText("Old exam")).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Quiz restored" }));
  });

  it("deletes for good only after the title is typed, and says how many results go", async () => {
    api.quizzes.deleteForever.mockResolvedValue({ deletedResults: 3 });
    render(<QuizzesPage initial={list} />);
    fireEvent.click(screen.getByRole("button", { name: /Trash/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete forever" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/3 results/)).toBeTruthy();
    const confirm = within(dialog).getByRole("button", { name: "Delete forever" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(within(dialog).getByLabelText(/Type the quiz's title/), { target: { value: "Old" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Type the quiz's title/), { target: { value: "Old exam" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(api.quizzes.deleteForever).toHaveBeenCalledWith("b", "Old exam"));
    await waitFor(() => expect(screen.queryByText("Old exam")).toBeNull());
  });
});
