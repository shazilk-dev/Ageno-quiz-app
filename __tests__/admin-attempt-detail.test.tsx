// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAttemptDetail, ReportRow } from "@/lib/admin-types";

const api = vi.hoisted(() => ({ attempt: vi.fn() }));
vi.mock("@/lib/admin-api", () => ({ adminReports: api }));

import AttemptDetailClient from "@/app/(admin)/quiz-reports/[attemptId]/AttemptDetailClient";
import { ReportsTable } from "@/components/admin/ReportsTable";
import { ApiRequestError } from "@/lib/api-client";

const detail = (over: Partial<AdminAttemptDetail> = {}): AdminAttemptDetail => ({
  attemptId: "att1",
  quizId: "q1",
  quizTitle: "Networking basics",
  difficulty: "medium",
  player: { id: "u1", name: "Ada Lovelace", email: "ada@example.com" },
  startedAt: 1_000_000,
  submittedAt: 1_300_000,
  graded: true,
  questions: [
    { id: "a", text: "Right one", options: ["x", "y"], type: "single" },
    { id: "b", text: "Wrong one", options: ["x", "y"], type: "single" },
    { id: "c", text: "Skipped one", options: ["x", "y"], type: "single" },
  ],
  result: {
    responseId: "att1",
    graded: true,
    score: 33,
    rawPercent: 33,
    correct: 1,
    total: 3,
    answered: 2,
    multiplier: 1,
    timeTakenSec: 300,
    late: false,
    answers: { a: [0], b: [1], c: [] },
    tabSwitches: 0,
    blurs: 0,
    fullscreenExits: 0,
    review: {
      a: { correct: [0] },
      b: { correct: [0], optionRationales: [null, "Y is not it."] },
      c: { correct: [1] },
    },
  },
  events: [],
  eventsTruncated: false,
  ...over,
});

beforeEach(() => {
  api.attempt.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

describe("Admin attempt detail", () => {
  it("shows who it was, the score, and each answer in the admin's words", () => {
    render(<AttemptDetailClient attemptId="att1" initial={detail()} />);

    expect(screen.getByRole("heading", { name: "Ada Lovelace" })).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByText("Networking basics")).toBeTruthy();
    expect(screen.getByTestId("attempt-score").textContent).toBe("33%");
    // The wrong pick is labelled as theirs, never "Your answer".
    expect(screen.getAllByText(/Their answer/).length).toBe(2);
    expect(screen.queryByText(/Your answer/)).toBeNull();
    expect(api.attempt).not.toHaveBeenCalled();
  });

  it("filters to the wrong and the skipped questions", () => {
    render(<AttemptDetailClient attemptId="att1" initial={detail()} />);

    fireEvent.click(screen.getByRole("button", { name: /Wrong/ }));
    expect(screen.getByText("Wrong one")).toBeTruthy();
    expect(screen.queryByText("Right one")).toBeNull();
    expect(screen.queryByText("Skipped one")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Not answered/ }));
    expect(screen.getByText("Skipped one")).toBeTruthy();
    expect(screen.queryByText("Wrong one")).toBeNull();
  });

  it("lists what the browser recorded, in time into the attempt", () => {
    render(
      <AttemptDetailClient
        attemptId="att1"
        initial={detail({
          events: [
            { type: "tab_hidden", at: 1_000_000 + 75_000 },
            { type: "fullscreen_exit", at: 1_000_000 + 130_000 },
          ],
          result: { ...detail().result, tabSwitches: 1, fullscreenExits: 1 },
        })}
      />
    );
    const table = screen.getByRole("table", { name: /Events recorded/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("1:15")).toBeTruthy();
    expect(within(rows[0]).getByText(/Switched to another tab/)).toBeTruthy();
    expect(within(rows[1]).getByText("2:10")).toBeTruthy();
    expect(within(rows[1]).getByText("Left fullscreen")).toBeTruthy();
  });

  it("says plainly when nothing was recorded", () => {
    render(<AttemptDetailClient attemptId="att1" initial={detail()} />);
    expect(screen.getByText(/Nothing was recorded/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("does not offer a Wrong filter or a score for a quiz marked by hand", () => {
    render(
      <AttemptDetailClient
        attemptId="att1"
        initial={detail({ graded: false, result: { ...detail().result, graded: false, score: null } })}
      />
    );
    expect(screen.getByText("Not scored")).toBeTruthy();
    expect(screen.getByText(/isn.t marked automatically/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Wrong/ })).toBeNull();
  });

  it("asks for the result when the page came without it, and offers Try again on a failure", async () => {
    api.attempt.mockRejectedValueOnce(new ApiRequestError(500, "boom", "Server error"));
    api.attempt.mockResolvedValueOnce(detail());
    render(<AttemptDetailClient attemptId="att1" />);

    expect(await screen.findByText("Couldn't open this result")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Ada Lovelace" })).toBeTruthy();
    expect(api.attempt).toHaveBeenCalledTimes(2);
    expect(api.attempt).toHaveBeenCalledWith("att1");
  });

  it("explains a result whose answers are no longer stored", async () => {
    api.attempt.mockRejectedValue(
      new ApiRequestError(404, "attempt_not_found", "The detailed answers for this result aren't stored.")
    );
    render(<AttemptDetailClient attemptId="gone" />);
    await waitFor(() => expect(screen.getByText("We can't show the answers for this result")).toBeTruthy());
    expect(screen.getByText(/aren.t stored/)).toBeTruthy();
  });
});

describe("Reports table links", () => {
  it("links each result to its detail page", () => {
    const row: ReportRow = {
      id: "att 1",
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
    };
    render(<ReportsTable rows={[row]} />);
    const link = screen.getByRole("link", { name: /Ada.*answers to Networking/ });
    expect(link.getAttribute("href")).toBe("/quiz-reports/att%201");
  });
});
