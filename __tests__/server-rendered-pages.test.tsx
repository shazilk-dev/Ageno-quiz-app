// @vitest-environment jsdom
// Pages the server renders with their data (S3): the browser shows it at once and doesn't ask again.
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetchQuiz: vi.fn(), fetchQuizzes: vi.fn(), fetchAttemptResult: vi.fn() }));
vi.mock("@/lib/quizzes-api", () => ({ fetchQuiz: api.fetchQuiz, fetchQuizzes: api.fetchQuizzes }));
vi.mock("@/lib/exam/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/exam/api")>()),
  fetchAttemptResult: api.fetchAttemptResult,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ attemptId: "a1" }),
  usePathname: () => "/",
}));
const auth = { user: { uid: "u1" }, loading: false };
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => auth }));

import AttemptReview from "@/app/(user)/my-quizzes/[attemptId]/AttemptReview";
import JoinClient from "@/app/(quiz)/join/JoinClient";
import { useQuizLoader } from "@/hooks/useQuizLoader";
import type { PublicQuizDTO } from "@/lib/quiz-data";

const quizDTO = (over: Partial<PublicQuizDTO> = {}): PublicQuizDTO => ({
  id: "q1",
  title: "Networking",
  description: "Packets and ports",
  duration: 20,
  requiresAccessCode: false,
  examMode: "practice",
  availableDifficulties: ["easy", "hard"],
  difficultySettings: {},
  createdAt: Date.UTC(2026, 9, 1),
  ...over,
});

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

describe("Lobby loader", () => {
  it("is ready at once with the page's quiz, and only fetches on a reload", async () => {
    const initial = { quiz: quizDTO(), active: true, counts: { easy: 4, hard: 2 } };
    const { result } = renderHook(() => useQuizLoader("q1", initial));
    expect(result.current.status).toBe("ready");
    expect(result.current.quiz?.title).toBe("Networking");
    expect(result.current.quiz?.createdAt).toBeInstanceOf(Date);
    expect(result.current.questionCount).toBeGreaterThan(0);
    expect(api.fetchQuiz).not.toHaveBeenCalled();

    api.fetchQuiz.mockResolvedValue({ quiz: { ...initial.quiz, createdAt: new Date() }, active: false, counts: {} });
    act(() => result.current.reload());
    await waitFor(() => expect(api.fetchQuiz).toHaveBeenCalledWith("q1"));
  });

  it("fetches when the page came without the quiz", async () => {
    api.fetchQuiz.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useQuizLoader("q1", null));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(api.fetchQuiz).toHaveBeenCalledTimes(1));
  });
});

describe("Join page", () => {
  it("lists the quizzes the page came with, without asking again", () => {
    render(<JoinClient initialQuizzes={[quizDTO(), quizDTO({ id: "q2", title: "Security" })]} />);
    expect(screen.getByText("Networking")).toBeTruthy();
    expect(screen.getByText("Security")).toBeTruthy();
    expect(api.fetchQuizzes).not.toHaveBeenCalled();
  });

  it("loads the list itself when the server couldn't", async () => {
    api.fetchQuizzes.mockResolvedValue([]);
    render(<JoinClient initialQuizzes={null} />);
    await waitFor(() => expect(api.fetchQuizzes).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("No quizzes are open yet")).toBeTruthy();
  });
});

describe("Attempt review", () => {
  it("says the attempt can't be found when the server already knew, without asking again", () => {
    render(<AttemptReview initial={{ kind: "missing" }} />);
    expect(screen.getByText("We couldn't find that attempt")).toBeTruthy();
    expect(api.fetchAttemptResult).not.toHaveBeenCalled();
  });

  it("shows the finished attempt the server already had, with a table in its question, without asking again", async () => {
    const table = "| Region | Q1 |\n|---|---|\n| North | 120 |";
    render(
      <AttemptReview
        initial={{
          kind: "ready",
          data: {
            attemptId: "a1",
            quizId: "q1",
            quizTitle: "Sales basics",
            difficulty: "easy",
            submittedAt: Date.UTC(2026, 9, 1),
            questions: [{ id: "x", text: `Read this.\n\n${table}`, options: ["North", "South"], type: "single" }],
            result: {
              responseId: "a1",
              graded: true,
              score: 100,
              rawPercent: 100,
              correct: 1,
              total: 1,
              answered: 1,
              multiplier: 1,
              timeTakenSec: 30,
              late: false,
              answers: { x: [0] },
              tabSwitches: 0,
              blurs: 0,
              fullscreenExits: 0,
              review: { x: { correct: [0], explanation: "North sold 120." } },
            },
          },
        }}
      />
    );
    expect(await screen.findByText("Sales basics")).toBeTruthy();
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getByText("North sold 120.")).toBeTruthy();
    expect(api.fetchAttemptResult).not.toHaveBeenCalled();
  });
});
