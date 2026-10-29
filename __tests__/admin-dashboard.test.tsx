// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardData, TrendDay } from "@/lib/admin-types";

const api = vi.hoisted(() => ({
  reports: { dashboard: vi.fn() },
  quizzes: { trash: vi.fn() },
}));
vi.mock("@/lib/admin-api", () => ({ adminReports: api.reports, adminQuizzes: api.quizzes }));
vi.mock("@/components/ui/Toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/Toast")>()),
  useToast: () => ({ toast: vi.fn() }),
}));

import DashboardClient from "@/app/(admin)/dashboard/DashboardClient";
import { TrendChart } from "@/components/admin/TrendChart";

const days = (counts: number[]): TrendDay[] =>
  counts.map((results, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, results }));

const data = (over: Partial<DashboardData> = {}): DashboardData => ({
  totals: { users: 3, quizzes: 2, attempts: 9, averageScore: 61 },
  trend: days([0, 2, 5, 1]),
  attention: [],
  recentQuizzes: [],
  recent: [],
  ...over,
});

beforeEach(() => api.reports.dashboard.mockReset());
afterEach(cleanup);

describe("Dashboard: needs attention and the trend", () => {
  it("lists a low-average quiz and a noisy result, each with a link to look closer", () => {
    render(
      <DashboardClient
        initial={data({
          attention: [
            { kind: "low_average", quizId: "q 1", title: "Networking", average: 38, results: 12 },
            { kind: "integrity", attemptId: "a1", userName: "Ada", quizTitle: "Networking", events: 7 },
          ],
        })}
      />
    );
    const section = screen.getByRole("region", { name: "Needs attention" });
    expect(within(section).getByText("Networking")).toBeTruthy();
    expect(within(section).getByText("Average score 38% across 12 results.")).toBeTruthy();
    expect(within(section).getByRole("link", { name: "See which questions" }).getAttribute("href")).toBe(
      "/quizzes/q%201"
    );
    expect(within(section).getByText("Ada on Networking")).toBeTruthy();
    expect(within(section).getByRole("link", { name: "Open the result" }).getAttribute("href")).toBe(
      "/quiz-reports/a1"
    );
  });

  it("shows nothing about attention when there is nothing to look at", () => {
    render(<DashboardClient initial={data()} />);
    expect(screen.queryByText("Needs attention")).toBeNull();
    expect(screen.getByText("Results per day")).toBeTruthy();
  });

  it("says in words what the trend shows", () => {
    render(<DashboardClient initial={data()} />);
    expect(screen.getByText("8 results in the last 4 days; the busiest day was Oct 3 with 5.")).toBeTruthy();
  });
});

describe("Trend chart", () => {
  it("has a sentence and no bars when nothing happened", () => {
    const { container } = render(<TrendChart days={days([0, 0, 0])} />);
    expect(screen.getByText("No results in the last 3 days.")).toBeTruthy();
    expect(container.querySelectorAll("[title]").length).toBe(0);
  });

  it("draws one bar a day, hidden from screen readers, tallest for the busiest day", () => {
    const { container } = render(<TrendChart days={days([1, 4, 2])} />);
    const bars = [...container.querySelectorAll<HTMLElement>("[title]")];
    expect(bars.map((bar) => bar.title)).toEqual(["Oct 1: 1", "Oct 2: 4", "Oct 3: 2"]);
    expect(bars[1].style.height).toBe("100%");
    expect(bars[0].parentElement?.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses singular words for one result", () => {
    render(<TrendChart days={days([0, 1])} />);
    expect(screen.getByText("1 result in the last 2 days; the busiest day was Oct 2 with 1.")).toBeTruthy();
  });
});
