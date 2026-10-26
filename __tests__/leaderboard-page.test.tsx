// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOverallBoard,
  buildQuizBoard,
  leaderboardFromDTO,
  type Leaderboard,
  type LeaderboardDTO,
  type LeaderboardRow,
} from "@/lib/leaderboard";

const fetchLeaderboard = vi.fn();
vi.mock("@/lib/quizzes-api", () => ({ fetchLeaderboard: (f: unknown) => fetchLeaderboard(f) }));
// A stable object, like the real context.
const auth = { user: { uid: "me" }, loading: false };
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => auth }));

import LeaderboardPage from "@/app/(user)/leaderboard/LeaderboardClient";

const row = (userId: string, quizId: string, score: number): LeaderboardRow => ({
  userId,
  quizId,
  score,
  selectedDifficulty: "medium",
  startedAt: new Date(2026, 9, 1, 10, 0).getTime(),
  submittedAt: new Date(2026, 9, 1, 10, 5).getTime(),
});

const names = { me: "Me Myself", u2: "Grace", u3: "Linus" };
const quizzes = { q1: "Networking", q2: "Security" };

/** A board as the server ranks it (the server uses the same builders for its week and month boards). */
function overallDTO(rows: LeaderboardRow[], shown = 50): LeaderboardDTO {
  const ranked = buildOverallBoard(rows, names);
  return {
    mode: "overall",
    entries: ranked.slice(0, shown),
    me: ranked.find((e) => e.userId === "me") ?? null,
    total: ranked.length,
    quizzes,
  };
}
function quizDTO(rows: LeaderboardRow[]): LeaderboardDTO {
  const ranked = buildQuizBoard(rows, names);
  return { mode: "quiz", entries: ranked, me: ranked.find((e) => e.userId === "me") ?? null, total: ranked.length, quizzes };
}
const overall = (rows: LeaderboardRow[], shown?: number): Leaderboard => leaderboardFromDTO(overallDTO(rows, shown));
const quiz = (rows: LeaderboardRow[]): Leaderboard => leaderboardFromDTO(quizDTO(rows));

beforeEach(() => {
  fetchLeaderboard.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

describe("Leaderboard page", () => {
  it("ranks people by the sum of their best scores and marks the signed-in person", async () => {
    fetchLeaderboard.mockResolvedValue(
      overall([row("u2", "q1", 90), row("u2", "q2", 80), row("me", "q1", 60), row("u3", "q1", 95)])
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
    fetchLeaderboard.mockResolvedValueOnce(overall([row("u2", "q1", 90), row("me", "q1", 70)]));
    fetchLeaderboard.mockResolvedValueOnce(quiz([row("u2", "q1", 90), row("me", "q1", 70)]));
    render(<LeaderboardPage />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Quiz"), { target: { value: "q1" } });
    await waitFor(() =>
      expect(fetchLeaderboard).toHaveBeenLastCalledWith({ timeFrame: "all", quizId: "q1", difficulty: "" })
    );
    expect(await screen.findByRole("columnheader", { name: "Score" })).toBeTruthy();
  });

  it("offers real difficulty levels (the old 'Basic' matched nothing)", async () => {
    fetchLeaderboard.mockResolvedValue(overall([row("u2", "q1", 90)]));
    render(<LeaderboardPage />);
    await screen.findByRole("table");

    const options = within(screen.getByLabelText("Difficulty")).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(["", "easy", "medium", "hard"]);
  });

  it("tells the person how to get on the board, and handles an empty one", async () => {
    fetchLeaderboard.mockResolvedValueOnce(overall([row("u2", "q1", 90)]));
    const view = render(<LeaderboardPage />);
    expect(await screen.findByText(/not on this board yet/)).toBeTruthy();
    view.unmount();

    fetchLeaderboard.mockResolvedValueOnce(overall([]));
    render(<LeaderboardPage />);
    expect(await screen.findByText("No one is on the board yet")).toBeTruthy();
  });

  it("shows a plain error with Retry", async () => {
    fetchLeaderboard.mockRejectedValueOnce(new Error("We couldn't reach the server."));
    fetchLeaderboard.mockResolvedValueOnce(overall([row("u2", "q1", 90)]));
    render(<LeaderboardPage />);

    expect(await screen.findByText("We couldn't load the leaderboard")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table")).toBeTruthy();
  });

  it("shows the board the page came with, without asking again, and keeps it up while a filter loads", async () => {
    const initial = overallDTO([row("u2", "q1", 90), row("me", "q1", 70)]);
    let finish: (value: Leaderboard) => void = () => {};
    fetchLeaderboard.mockImplementation(() => new Promise<Leaderboard>((resolve) => (finish = resolve)));
    render(<LeaderboardPage initialBoard={initial} />);

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Grace")).toBeTruthy();
    expect(fetchLeaderboard).not.toHaveBeenCalled();

    // A filter change asks the server; the old board stays on screen, marked busy, until the answer comes.
    fireEvent.change(screen.getByLabelText("Quiz"), { target: { value: "q1" } });
    await waitFor(() => expect(fetchLeaderboard).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Rankings" }).getAttribute("aria-busy")).toBe("true");

    finish(quiz([row("u3", "q1", 99)]));
    expect(await screen.findByText("Linus")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Rankings" }).getAttribute("aria-busy")).toBe("false");

    // Back to every quiz: the page's own board is no longer on screen, so it is asked for again.
    fetchLeaderboard.mockResolvedValue(overall([row("u2", "q1", 90)]));
    fireEvent.change(screen.getByLabelText("Quiz"), { target: { value: "" } });
    await waitFor(() => expect(fetchLeaderboard).toHaveBeenCalledTimes(2));
  });

  it("shows the viewer's own place from the server even when it's below the rows shown", async () => {
    const rows = [
      ...Array.from({ length: 60 }, (_, i) => row(`p${i}`, "q1", 100 - i)),
      row("me", "q1", 5),
    ];
    fetchLeaderboard.mockResolvedValue(overall(rows));
    render(<LeaderboardPage />);

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(51); // header + 50
    expect(screen.getByText("#61")).toBeTruthy();
    expect(screen.getByText("of 61")).toBeTruthy();
    expect(screen.getByText("Showing the top 50 of 61.")).toBeTruthy();
  });
});
