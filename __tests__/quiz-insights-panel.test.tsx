// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestionInsight, QuizInsights } from "@/lib/item-analysis";

const api = vi.hoisted(() => ({ insights: vi.fn(), questionResults: vi.fn() }));
vi.mock("@/lib/admin-api", () => ({ adminQuizzes: api }));
const saved = vi.hoisted(() => vi.fn());
vi.mock("@/lib/download", () => ({ downloadText: saved }));

import { QuizInsightsPanel } from "@/components/admin/QuizInsightsPanel";
import { ApiRequestError } from "@/lib/api-client";

const question = (over: Partial<QuestionInsight>): QuestionInsight => ({
  id: "q",
  position: 1,
  label: "A question",
  type: "single",
  attempts: 40,
  answered: 38,
  correct: 20,
  difficulty: 0.5,
  discrimination: 0.4,
  options: [
    { index: 0, text: "Right one", correct: true, picks: 20, rate: 0.5 },
    { index: 1, text: "Tempting one", correct: false, picks: 18, rate: 0.45 },
  ],
  flags: [],
  enough: true,
  ...over,
});

const insights = (over: Partial<QuizInsights> = {}): QuizInsights => ({
  quizId: "quiz1",
  analysed: 40,
  total: 40,
  flagged: 1,
  levels: [
    {
      level: "easy",
      attempts: 40,
      questions: [
        question({ id: "a", position: 1, label: "Fine question", difficulty: 0.7 }),
        question({ id: "b", position: 2, label: "Hard question", difficulty: 0.1, correct: 4, flags: ["very_hard"] }),
        question({ id: "c", position: 3, label: "Keyless question", difficulty: null, correct: null, discrimination: null }),
      ],
    },
    { level: "hard", attempts: 0, questions: [question({ id: "d", label: "Untaken question" })] },
  ],
  ...over,
});

beforeEach(() => {
  api.insights.mockReset();
  api.questionResults.mockReset();
  saved.mockReset();
});
afterEach(cleanup);

describe("Results by question", () => {
  it("shows the share right, the separation, and says how many results it is based on", async () => {
    api.insights.mockResolvedValue(insights({ analysed: 40, total: 120 }));
    render(<QuizInsightsPanel quizId="quiz1" />);

    expect(await screen.findByText("Fine question")).toBeTruthy();
    expect(screen.getByTestId("insights-basis").textContent).toContain("latest 40 of 120 results");
    const row = screen.getByText("Fine question").closest("li") as HTMLElement;
    expect(within(row).getByText("70%")).toBeTruthy();
    expect(within(row).getByText("+0.40")).toBeTruthy();
    expect(screen.getByText("No key")).toBeTruthy();
    expect(screen.getByText("No one has finished this level yet.")).toBeTruthy();
    expect(api.insights).toHaveBeenCalledWith("quiz1");
  });

  it("explains a flag in words next to the question", async () => {
    api.insights.mockResolvedValue(insights());
    render(<QuizInsightsPanel quizId="quiz1" />);
    const row = (await screen.findByText("Hard question")).closest("li") as HTMLElement;
    expect(within(row).getByText("Very hard")).toBeTruthy();
    expect(within(row).getByText(/Under 30% got it right/)).toBeTruthy();
  });

  it("narrows to the questions that need attention, and orders hardest first", async () => {
    api.insights.mockResolvedValue(insights());
    render(<QuizInsightsPanel quizId="quiz1" />);
    await screen.findByText("Fine question");

    fireEvent.change(screen.getByLabelText("Order"), { target: { value: "hardest" } });
    const labels = screen.getAllByText(/ question$/).map((node) => node.textContent);
    expect(labels.slice(0, 3)).toEqual(["Hard question", "Fine question", "Keyless question"]);

    fireEvent.click(screen.getByRole("button", { name: /Needs attention/ }));
    expect(screen.getByText("Hard question")).toBeTruthy();
    expect(screen.queryByText("Fine question")).toBeNull();
  });

  it("lists how often each option was picked", async () => {
    api.insights.mockResolvedValue(insights());
    render(<QuizInsightsPanel quizId="quiz1" />);
    const row = (await screen.findByText("Fine question")).closest("li") as HTMLElement;
    expect(within(row).getByText("Tempting one")).toBeTruthy();
    expect(within(row).getByText("18 · 45%")).toBeTruthy();
  });

  it("says when there are too few results to flag anything", async () => {
    api.insights.mockResolvedValue(
      insights({ levels: [{ level: "easy", attempts: 4, questions: [question({ attempts: 4, enough: false })] }] })
    );
    render(<QuizInsightsPanel quizId="quiz1" />);
    expect(await screen.findByText(/Only 4 results so far/)).toBeTruthy();
  });

  it("has an empty state before anyone has finished the quiz", async () => {
    api.insights.mockResolvedValue(insights({ analysed: 0, total: 0, levels: [], flagged: 0 }));
    render(<QuizInsightsPanel quizId="quiz1" />);
    expect(await screen.findByText("No results yet")).toBeTruthy();
  });

  it("offers Try again when it fails", async () => {
    api.insights.mockRejectedValueOnce(new ApiRequestError(503, "index_required", "Not ready yet."));
    api.insights.mockResolvedValueOnce(insights());
    render(<QuizInsightsPanel quizId="quiz1" />);
    expect(await screen.findByText("Not ready yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Fine question")).toBeTruthy());
  });

  it("downloads the results as a CSV and says how many rows it holds", async () => {
    api.insights.mockResolvedValue(insights());
    api.questionResults.mockResolvedValue({ filename: "networking-results-by-question.csv", csv: "a,b", rows: 1240, truncated: false, results: 40 });
    render(<QuizInsightsPanel quizId="quiz1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Download results CSV/ }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith("networking-results-by-question.csv", "a,b", "text/csv"));
    expect(api.questionResults).toHaveBeenCalledWith("quiz1");
    expect((await screen.findByRole("status")).textContent).toBe("Saved 1,240 rows from 40 results.");
  });

  it("tells the admin when the export had to stop early", async () => {
    api.insights.mockResolvedValue(insights());
    api.questionResults.mockResolvedValue({ filename: "x.csv", csv: "a", rows: 100000, truncated: true, results: 2000 });
    render(<QuizInsightsPanel quizId="quiz1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Download results CSV/ }));
    expect((await screen.findByRole("status")).textContent).toContain("first 100,000 rows");
  });

  it("shows why a download failed and saves nothing", async () => {
    api.insights.mockResolvedValue(insights());
    api.questionResults.mockRejectedValue(new ApiRequestError(503, "index_required", "Not ready yet."));
    render(<QuizInsightsPanel quizId="quiz1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Download results CSV/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Not ready yet.");
    expect(saved).not.toHaveBeenCalled();
  });
});
