// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyAttempt } from "@/lib/quizzes-api";

const fetchMyAttempts = vi.fn();
vi.mock("@/lib/quizzes-api", () => ({ fetchMyAttempts: () => fetchMyAttempts() }));
// A stable object, like the real context: a new one per render would re-run the page's load effect.
const signedIn = { user: { uid: "u1" }, loading: false };
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => signedIn }));

import MyQuizzes from "@/app/(user)/my-quizzes/page";

const attempt = (over: Partial<MyAttempt>): MyAttempt => ({
  id: "a1",
  quizId: "q1",
  quizTitle: "Networking basics",
  quizDescription: "",
  startedAt: new Date(Date.now() - 6 * 60_000),
  submittedAt: new Date(Date.now() - 60_000),
  score: 80,
  tabSwitchCount: 0,
  fullscreenExits: 0,
  selectedDifficulty: "medium",
  hasResult: true,
  ...over,
});

beforeEach(() => {
  fetchMyAttempts.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

describe("My quizzes", () => {
  it("lists attempts as links to their review, with the numbers including a 0% score", async () => {
    fetchMyAttempts.mockResolvedValue([
      attempt({ id: "a1", score: 100, quizTitle: "Newest" }),
      attempt({ id: "a2", score: 0, quizTitle: "Zero", tabSwitchCount: 3 }),
    ]);
    render(<MyQuizzes />);

    const newest = await screen.findByRole("link", { name: /Newest/ });
    expect(newest.getAttribute("href")).toBe("/my-quizzes/a1");
    expect(screen.getByRole("link", { name: /Zero/ }).getAttribute("href")).toBe("/my-quizzes/a2");
    expect(screen.getByText("Recorded: 3 tab switches")).toBeTruthy();
    // Average of 100 and 0 is 50: the 0% attempt counts.
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("Personal best")).toBeTruthy();
  });

  it("shows a result saved before reviews existed without a link", async () => {
    fetchMyAttempts.mockResolvedValue([attempt({ id: "old", hasResult: false, quizTitle: "Old one" })]);
    render(<MyQuizzes />);

    await screen.findByText("Old one");
    expect(screen.queryByRole("link", { name: /Old one/ })).toBeNull();
  });

  it("explains an empty history and points to the quizzes", async () => {
    fetchMyAttempts.mockResolvedValue([]);
    render(<MyQuizzes />);

    expect(await screen.findByText("You haven't finished a quiz yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find a quiz" }).getAttribute("href")).toBe("/join");
  });

  it("shows a plain error with Retry, and no developer text", async () => {
    fetchMyAttempts.mockRejectedValueOnce(new Error("The query requires an index. https://console.firebase.google.com/x"));
    fetchMyAttempts.mockResolvedValueOnce([attempt({})]);
    render(<MyQuizzes />);

    expect(await screen.findByText("We couldn't load your attempts")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/index|Firebase|F12|User ID/i);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Networking basics")).toBeTruthy());
  });
});
