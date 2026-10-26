// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Leaderboard, LeaderboardRow } from "@/lib/quizzes-api";

const fetchLeaderboard = vi.fn();
vi.mock("@/lib/quizzes-api", () => ({ fetchLeaderboard: (f: unknown) => fetchLeaderboard(f) }));
// A stable object, like the real context.
const auth = { user: { uid: "me" }, loading: false };
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => auth }));

import LeaderboardPage from "@/app/(user)/leaderboard/page";

let n = 0;
const row = (userId: string, quizId: string, score: number): LeaderboardRow => ({
  id: `r${++n}`,
  userId,
  quizId,
  score,
  selectedDifficulty: "medium",
  startedAt: new Date(2026, 9, 1, 10, 0),
  submittedAt: new Date(2026, 9, 1, 10, 5),
});

const board = (rows: LeaderboardRow[]): Leaderboard => ({
  rows,
  users: { me: "Me Myself", u2: "Grace", u3: "Linus" },
  quizzes: { q1: "Networking", q2: "Security" },
});

beforeEach(() => {
  fetchLeaderboard.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

describe("Leaderboard page", () => {
  it("ranks people by the sum of their best scores and marks the signed-in person", async () => {
    fetchLeaderboard.mockResolvedValue(
      board([row("u2", "q1", 90), row("u2", "q2", 80), row("me", "q1", 60), row("u3", "q1", 95)])
    );
    render(<LeaderboardPage />);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[1].textContent)).toEqual([
      "Grace",
      "Linus",
      "Me Myself" + "You",
    ]);
    expect(screen.getByText("#3")).toBeTruthy();
    expect(screen.getByText("of 3")).toBeTruthy();
  });

  it("switches to a single quiz's ranking when a quiz is picked, and asks the server for it", async () => {
    fetchLeaderboard.mockResolvedValue(board([row("u2", "q1", 90), row("me", "q1", 70)]));
    render(<LeaderboardPage />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Quiz"), { target: { value: "q1" } });
    await waitFor(() =>
      expect(fetchLeaderboard).toHaveBeenLastCalledWith({ timeFrame: "all", quizId: "q1", difficulty: "" })
    );
    expect(await screen.findByRole("columnheader", { name: "Score" })).toBeTruthy();
  });

  it("offers real difficulty levels (the old 'Basic' matched nothing)", async () => {
    fetchLeaderboard.mockResolvedValue(board([row("u2", "q1", 90)]));
    render(<LeaderboardPage />);
    await screen.findByRole("table");

    const options = within(screen.getByLabelText("Difficulty")).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(["", "easy", "medium", "hard"]);
  });

  it("tells the person how to get on the board, and handles an empty one", async () => {
    fetchLeaderboard.mockResolvedValueOnce(board([row("u2", "q1", 90)]));
    const view = render(<LeaderboardPage />);
    expect(await screen.findByText(/not on this board yet/)).toBeTruthy();
    view.unmount();

    fetchLeaderboard.mockResolvedValueOnce(board([]));
    render(<LeaderboardPage />);
    expect(await screen.findByText("No one is on the board yet")).toBeTruthy();
  });

  it("shows a plain error with Retry", async () => {
    fetchLeaderboard.mockRejectedValueOnce(new Error("We couldn't reach the server."));
    fetchLeaderboard.mockResolvedValueOnce(board([row("u2", "q1", 90)]));
    render(<LeaderboardPage />);

    expect(await screen.findByText("We couldn't load the leaderboard")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table")).toBeTruthy();
  });
});
