// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserDTO, ReportRow } from "@/lib/admin-types";

const api = vi.hoisted(() => ({
  users: { list: vi.fn(), setRole: vi.fn(), remove: vi.fn() },
  reports: { page: vi.fn(), dashboard: vi.fn() },
}));
vi.mock("@/lib/admin-api", () => ({
  adminUsers: api.users,
  adminReports: api.reports,
  adminQuizzes: { remove: vi.fn() },
}));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/Toast")>()),
  useToast: () => ({ toast }),
}));
// A stable object, like the real context.
const auth = { user: { uid: "me" }, loading: false, isAdmin: true };
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => auth }));

import QuizReportsPage from "@/app/(admin)/quiz-reports/page";
import UsersPage from "@/app/(admin)/users/page";

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
  Object.values({ ...api.users, ...api.reports }).forEach((fn) => fn.mockReset());
  toast.mockReset();
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
