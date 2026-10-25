// @vitest-environment jsdom
// Behavioural tests for one exam attempt: answering, keyboard, flags, the submit flow (double submit,
// failure and retry, timeout), autosave (device and server) and resume. The attempt routes are mocked
// by a small fake server that scores with the real scoring function, so nothing here needs a server:
//   npx vitest run __tests__/quiz-attempt.test.tsx
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicQuiz } from "@/lib/quiz-data";
import type { AttemptSeed } from "@/hooks/useQuizAttempt";
import type { StoredQuestion } from "@/lib/exam/normalize";
import { scoreAttempt } from "@/lib/exam/scoring";
import { attemptKey, loadAttempt } from "@/lib/exam/storage";
import type { SubmitResult } from "@/lib/exam/types";

const submitAttempt = vi.fn();
const saveProgress = vi.fn();
vi.mock("@/lib/exam/api", () => ({
  submitAttempt: (...args: unknown[]) => submitAttempt(...args),
  saveProgress: (...args: unknown[]) => saveProgress(...args),
}));
// The real frame pulls in the header, auth and Firebase; the exam only needs the hook's contract.
vi.mock("@/components/layout/QuizFrame", () => ({ useExamMode: vi.fn() }));

import QuizAttempt from "@/components/quiz/exam/QuizAttempt";

// What the server knows. The browser only ever gets the text and the options.
const KEYS: Record<string, number> = { q1: 1, q2: 0, q3: 2 };
const stored: StoredQuestion[] = Object.entries(KEYS).map(([id, correctIndex]) => ({
  id,
  text: `What is ${id}?`,
  options: ["A", "B", "C"].map((text) => `${id} option ${text}`),
  correctIndex,
}));

interface ServerOptions {
  multiplier?: number;
  review?: boolean;
  autoCheck?: boolean;
  late?: boolean;
}

const serverResult = (
  payload: { answers: Record<string, number | null>; events?: { type: string }[] },
  { multiplier = 1.5, review = true, autoCheck = true, late = false }: ServerOptions = {}
): SubmitResult => {
  const s = scoreAttempt({ questions: stored, answers: payload.answers, autoCheck, multiplier });
  // Like the real server: the counts come from the events it was sent.
  const count = (type: string) => (payload.events ?? []).filter((e) => e.type === type).length;
  return {
    responseId: "attempt-1",
    graded: s.graded,
    score: s.score,
    rawPercent: s.rawPercent,
    correct: s.correct,
    total: s.total,
    answered: s.answered,
    multiplier: s.multiplier,
    timeTakenSec: 42,
    late,
    answers: payload.answers,
    tabSwitches: count("tab_hidden"),
    blurs: count("window_blur"),
    fullscreenExits: count("fullscreen_exit"),
    review:
      s.graded && review
        ? Object.fromEntries(stored.map((q) => [q.id, { correctIndex: q.correctIndex }]))
        : null,
  };
};

/** A result with just a score, for tests that don't look at the review. */
const scoreOnly = (score: number | null): SubmitResult => ({
  ...serverResult({ answers: {} }),
  graded: score !== null,
  score,
  review: null,
});

const quiz = {
  id: "quiz1",
  title: "Sample quiz",
  isAutoCheck: true,
} as unknown as PublicQuiz;

const seed = (overrides: Partial<AttemptSeed> = {}): AttemptSeed => ({
  attemptId: "attempt-1",
  startedAt: Date.now(),
  durationSec: 600,
  difficulty: "hard",
  questions: stored.map(({ id, text, options }) => ({ id, text, options })),
  ...overrides,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const renderAttempt = (
  props: Partial<React.ComponentProps<typeof QuizAttempt>> = {}
) =>
  render(
    <QuizAttempt
      quiz={quiz}
      seed={seed()}
      userId="u1"
      onRetry={vi.fn().mockResolvedValue(undefined)}
      onExit={vi.fn()}
      {...props}
    />
  );

const radios = () => screen.getAllByRole("radio") as HTMLInputElement[];
const heading = () => screen.getByRole("heading", { name: /What is/ });
const openSubmitDialog = () =>
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
const confirmSubmit = () =>
  act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }))
  );

beforeEach(() => {
  localStorage.clear();
  submitAttempt.mockReset();
  submitAttempt.mockImplementation(async (_id: string, payload: { answers: Record<string, number | null> }) =>
    serverResult(payload)
  );
  saveProgress.mockReset();
  saveProgress.mockResolvedValue({ ok: true });
  window.scrollTo = vi.fn();
  // jsdom has no modal <dialog>; mimic what showModal and close do to `open`.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => cleanup());

describe("answering", () => {
  it("shows one question as a radiogroup and records a pick", () => {
    renderAttempt();
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(radios()).toHaveLength(3);
    expect(radios().every((r) => !r.checked)).toBe(true);

    fireEvent.click(radios()[1]);
    expect(radios()[1].checked).toBe(true);
    expect(
      screen.getByRole("button", { name: "Question 1, answered" })
    ).toBeTruthy();
  });

  it("lets you clear an answer", () => {
    renderAttempt();
    fireEvent.click(radios()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Clear answer" }));
    expect(radios().every((r) => !r.checked)).toBe(true);
  });

  it("moves focus to the question heading when the question changes", () => {
    renderAttempt();
    expect(document.activeElement).toBe(heading());
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(heading().textContent).toContain("What is q2?");
    expect(document.activeElement).toBe(heading());
  });

  it("never has the right answer in the page while the exam is running", () => {
    renderAttempt();
    expect(document.body.innerHTML).not.toMatch(/correct/i);
    expect(document.body.innerHTML).not.toContain("isCorrect");
  });
});

describe("keyboard", () => {
  it("1-9 and A-Z pick an option; Left and Right move between questions", () => {
    renderAttempt();
    fireEvent.keyDown(document.body, { key: "2" });
    expect(radios()[1].checked).toBe(true);
    fireEvent.keyDown(document.body, { key: "c" });
    expect(radios()[2].checked).toBe(true);
    fireEvent.keyDown(document.body, { key: "d" }); // there is no fourth option
    expect(radios()[2].checked).toBe(true);

    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(heading().textContent).toContain("q2");
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    fireEvent.keyDown(document.body, { key: "ArrowRight" }); // already on the last one
    expect(heading().textContent).toContain("q3");
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(heading().textContent).toContain("q2");
  });

  it("takes Left and Right away from the radio group", () => {
    renderAttempt();
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    radios()[0].dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores shortcuts while a dialog is open", () => {
    renderAttempt();
    openSubmitDialog();
    fireEvent.keyDown(document.body, { key: "1" });
    expect(radios().every((r) => !r.checked)).toBe(true);
  });
});

describe("flags and the navigator", () => {
  it("flags a question and says so in the navigator", () => {
    renderAttempt();
    const flag = screen.getByRole("button", { name: /Flag/ });
    expect(flag.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(flag);
    expect(flag.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getAllByRole("button", {
        name: "Question 1, not answered, flagged for review",
      }).length
    ).toBeGreaterThan(0);
    fireEvent.click(flag);
    expect(flag.getAttribute("aria-pressed")).toBe("false");
  });

  it("jumps to a question from the navigator", () => {
    renderAttempt();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Question 3, not answered" })[0]
    );
    expect(heading().textContent).toContain("q3");
    expect(
      screen.getAllByRole("button", { name: /Question 3/ })[0].getAttribute("aria-current")
    ).toBe("step");
  });
});

describe("submitting", () => {
  it("confirms with the unanswered and flagged counts", () => {
    renderAttempt();
    fireEvent.click(radios()[1]);
    fireEvent.click(screen.getByRole("button", { name: /Flag/ }));
    openSubmitDialog();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("2 unanswered")).toBeTruthy();
    expect(within(dialog).getByText("1 flagged")).toBeTruthy();
    expect(submitAttempt).not.toHaveBeenCalled();
  });

  it("can't be submitted twice: two clicks send one request, keyed by the attempt id", async () => {
    const pending = deferred<SubmitResult>();
    submitAttempt.mockReturnValue(pending.promise);
    renderAttempt();
    fireEvent.click(radios()[1]);
    openSubmitDialog();

    const confirm = screen.getByRole("button", { name: "Submit answers" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(submitAttempt).toHaveBeenCalledTimes(1);
    expect(submitAttempt.mock.calls[0][0]).toBe("attempt-1");
    expect(screen.getByText(/Saving your answers/)).toBeTruthy();

    await act(async () => pending.resolve(scoreOnly(50)));
    expect(screen.getByTestId("quiz-score").textContent).toBe("50%");
    expect(submitAttempt).toHaveBeenCalledTimes(1);
  });

  it("a timer that runs out during a manual submit doesn't send a second request", async () => {
    vi.useFakeTimers();
    try {
      const pending = deferred<SubmitResult>();
      submitAttempt.mockReturnValue(pending.promise);
      // 500ms of time left.
      renderAttempt({ seed: seed({ startedAt: Date.now() - 599_500 }) });
      fireEvent.click(radios()[1]);
      openSubmitDialog();
      fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));
      expect(submitAttempt).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(2_000); // the deadline passes while the save is in flight
      });
      expect(submitAttempt).toHaveBeenCalledTimes(1);

      await act(async () => pending.resolve(scoreOnly(40)));
      expect(screen.getByTestId("quiz-score").textContent).toBe("40%");
      expect(submitAttempt).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends the answers and the counts, and nothing that could be scored locally", async () => {
    renderAttempt();
    fireEvent.click(radios()[0]);
    openSubmitDialog();
    await confirmSubmit();

    const [attemptId, payload] = submitAttempt.mock.calls[0];
    expect(attemptId).toBe("attempt-1");
    expect(payload).toEqual({
      answers: { q1: 0, q2: null, q3: null },
      events: [],
    });
  });

  it("shows a failure honestly with the reason, keeps the answers and retries on request", async () => {
    submitAttempt.mockRejectedValueOnce(
      new Error("We couldn't reach the server. Check your connection and try again.")
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderAttempt();
    fireEvent.click(radios()[1]);
    openSubmitDialog();
    await confirmSubmit();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/couldn't submit your answers/)).toBeTruthy();
    expect(within(dialog).getByText(/couldn't reach the server/)).toBeTruthy();
    expect(screen.queryByTestId("quiz-score")).toBeNull();
    // Nothing is passed off as a result, and the autosave is still there.
    expect(loadAttempt(attemptKey("quiz1", "u1"))?.answers.q1).toBe(1);

    await act(async () =>
      fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }))
    );
    expect(submitAttempt).toHaveBeenCalledTimes(2);
    // Same attempt id both times, so the server sees one response.
    expect(submitAttempt.mock.calls[1][0]).toBe("attempt-1");
    // q1's B is right: 1 of 3, 33% raw, x1.5.
    expect(screen.getByTestId("quiz-score").textContent).toBe("50%");
  });

  it("lets you go back to the questions after a failure (while there is time)", async () => {
    submitAttempt.mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderAttempt();
    openSubmitDialog();
    await confirmSubmit();
    fireEvent.click(screen.getByRole("button", { name: "Back to questions" }));
    expect(document.querySelector("dialog[open]")).toBeNull();
    fireEvent.click(radios()[2]);
    expect(radios()[2].checked).toBe(true);
  });

  it("auto-submits once when the time is up, and a failed one can only be retried", async () => {
    submitAttempt.mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      renderAttempt({
        seed: seed({ startedAt: Date.now() - 700_000, durationSec: 600 }),
      });
    });
    expect(submitAttempt).toHaveBeenCalledTimes(1);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Your time is up/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Back to questions" })).toBeNull();
    // Not dismissible: no close button either.
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();

    await act(async () =>
      fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }))
    );
    expect(screen.getByTestId("quiz-score").textContent).toBe("0%");
  });
});

describe("results", () => {
  const submitWith = async (picks: [number, number][]) => {
    for (const [question, option] of picks) {
      fireEvent.keyDown(document.body, { key: String(option + 1) });
      if (question < 2) fireEvent.keyDown(document.body, { key: "ArrowRight" });
    }
    openSubmitDialog();
    await confirmSubmit();
  };

  it("shows the server's score and time, explains the multiplier and never shows the response id", async () => {
    renderAttempt();
    // q1: B (right), q2: B (wrong, A is right), q3: A (wrong, C is right): 1 of 3
    await submitWith([[0, 1], [1, 1], [2, 0]]);

    expect(screen.getByTestId("quiz-score").textContent).toBe("50%");
    expect(screen.getByText("1 of 3")).toBeTruthy();
    expect(screen.getByText("0:42")).toBeTruthy();
    expect(screen.getByText(/Hard is worth ×1.5/)).toBeTruthy();
    expect(screen.getByText(/33% raw score counts as 50%/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("attempt-1");
  });

  it("reviews each question with your answer and the right one, and filters", async () => {
    renderAttempt();
    // q1: B (right), q2: A (right), q3: A (wrong, C is right)
    await submitWith([[0, 1], [1, 0], [2, 0]]);

    expect(screen.getByRole("heading", { name: "Review your answers" })).toBeTruthy();
    expect(screen.getAllByText("Your answer · Correct answer").length).toBe(2);
    expect(screen.getByText("Your answer")).toBeTruthy(); // q3's wrong pick
    expect(screen.getByText("Correct answer")).toBeTruthy(); // q3's right option

    fireEvent.click(screen.getByRole("button", { name: /^Incorrect/ }));
    expect(screen.getByText("What is q3?")).toBeTruthy();
    expect(screen.queryByText("What is q1?")).toBeNull();
  });

  it("shows an explanation from the server's review", async () => {
    submitAttempt.mockImplementation(async (_id: string, payload: { answers: Record<string, number | null> }) => {
      const result = serverResult(payload);
      result.review!.q3 = { correctIndex: 2, explanation: "Because C." };
      return result;
    });
    renderAttempt();
    await submitWith([[0, 1], [1, 0], [2, 0]]);
    expect(screen.getByText("Because C.")).toBeTruthy();
  });

  it("hides the review when the server sends none (owner turned it off), and when there is no score", async () => {
    submitAttempt.mockImplementation(async (_id: string, payload: { answers: Record<string, number | null> }) =>
      serverResult(payload, { review: false })
    );
    const { unmount } = renderAttempt();
    await submitWith([[0, 1], [1, 0], [2, 0]]);
    expect(screen.queryByRole("heading", { name: "Review your answers" })).toBeNull();
    expect(screen.getByTestId("quiz-score")).toBeTruthy();
    unmount();

    submitAttempt.mockImplementation(async (_id: string, payload: { answers: Record<string, number | null> }) =>
      serverResult(payload, { autoCheck: false })
    );
    renderAttempt();
    await submitWith([[0, 1], [1, 0], [2, 0]]);
    expect(screen.queryByTestId("quiz-score")).toBeNull();
    expect(screen.getByText("Answers submitted")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Review your answers" })).toBeNull();
    // Without a score there is no "correct of total" either.
    expect(screen.queryByText("Correct")).toBeNull();
  });

  it("says so when the submit came too late and only the saved answers counted", async () => {
    submitAttempt.mockImplementation(async (_id: string, payload: { answers: Record<string, number | null> }) =>
      serverResult(payload, { late: true })
    );
    renderAttempt();
    await submitWith([[0, 1], [1, 0], [2, 0]]);
    expect(screen.getByText(/only the answers saved before then counted/)).toBeTruthy();
  });

  it("reviews the answers the server counted, not the ones the browser held", async () => {
    submitAttempt.mockImplementation(async () =>
      serverResult({ answers: { q1: 1, q2: null, q3: null } })
    );
    renderAttempt();
    await submitWith([[0, 0], [1, 0], [2, 0]]);
    expect(screen.getByText("1 of 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Not answered/ }).textContent).toContain("2");
  });

  it("offers Back to quizzes, View my attempts and Retry", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const onExit = vi.fn();
    renderAttempt({ onRetry, onExit });
    await submitWith([[0, 1], [1, 0], [2, 2]]);

    expect(screen.getByRole("link", { name: "View my attempts" }).getAttribute("href")).toBe("/my-quizzes");
    fireEvent.click(screen.getByRole("button", { name: "Back to quizzes" }));
    expect(onExit).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry quiz" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("Retry shows it is working and, if a new attempt can't start, says why", async () => {
    let fail!: (error: Error) => void;
    const starting = new Promise<void>((_, reject) => (fail = reject));
    const onRetry = vi.fn().mockReturnValue(starting);
    renderAttempt({ onRetry });
    await submitWith([[0, 1], [1, 0], [2, 2]]);

    const retry = screen.getByRole("button", { name: "Retry quiz" });
    fireEvent.click(retry);
    expect(retry.getAttribute("aria-busy")).toBe("true");

    await act(async () => fail(new Error("This quiz isn't open right now.")));
    expect(screen.getByText("This quiz isn't open right now.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Retry quiz" }).getAttribute("aria-busy")
    ).toBeNull();
  });
});

describe("autosave and resume", () => {
  it("saves answers, flags, position and the start time on this device as you go", () => {
    const start = Date.now();
    renderAttempt({ seed: seed({ startedAt: start }) });
    const saved = () => loadAttempt(attemptKey("quiz1", "u1"));

    // Even before any answer, the running clock is saved.
    expect(saved()?.startedAt).toBe(start);

    fireEvent.click(radios()[1]);
    fireEvent.click(screen.getByRole("button", { name: /Flag/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));

    expect(saved()).toMatchObject({
      attemptId: "attempt-1",
      difficulty: "hard",
      durationSec: 600,
      questionIds: ["q1", "q2", "q3"],
      answers: { q1: 1, q2: null, q3: null },
      flagged: { q1: true },
      index: 1,
    });
  });

  it("restores a resumed attempt: position, answers, flags and tab switches", () => {
    renderAttempt({
      seed: seed({
        progress: {
          answers: { q1: 0, q2: 2, q3: null },
          flagged: { q2: true },
          index: 1,
          tabSwitches: 3,
          blurs: 0,
          fullscreenExits: 0,
          eventSeq: 3,
          pendingEvents: [],
        },
      }),
    });

    expect(heading().textContent).toContain("q2");
    expect(radios()[2].checked).toBe(true);
    expect(screen.getByText(/So far:\s*3/)).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Question 2, answered, flagged for review" }).length
    ).toBeGreaterThan(0);
  });

  it("clears the autosave once the answers are safely submitted", async () => {
    renderAttempt();
    fireEvent.click(radios()[1]);
    expect(loadAttempt(attemptKey("quiz1", "u1"))).not.toBeNull();

    openSubmitDialog();
    await confirmSubmit();
    expect(loadAttempt(attemptKey("quiz1", "u1"))).toBeNull();
  });

  it("asks before the page is closed or reloaded mid-attempt", () => {
    renderAttempt();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("autosave to the server", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

  it("sends nothing for an untouched attempt, then one patch once changes settle", async () => {
    renderAttempt();
    await advance(10_000);
    expect(saveProgress).not.toHaveBeenCalled();

    fireEvent.click(radios()[1]);
    fireEvent.click(radios()[2]); // a second change restarts the wait
    await advance(1_500);
    expect(saveProgress).not.toHaveBeenCalled();

    await advance(600);
    expect(saveProgress).toHaveBeenCalledTimes(1);
    expect(saveProgress).toHaveBeenCalledWith("attempt-1", {
      answers: { q1: 2, q2: null, q3: null },
      flagged: {},
      index: 0,
      events: [],
    });

    await advance(10_000);
    expect(saveProgress).toHaveBeenCalledTimes(1);
  });

  it("sends what a resumed attempt holds, once", async () => {
    renderAttempt({
      seed: seed({
        progress: {
          answers: { q1: 1, q2: null, q3: null },
          flagged: {},
          index: 0,
          tabSwitches: 0,
          blurs: 0,
          fullscreenExits: 0,
          eventSeq: 0,
          pendingEvents: [],
        },
      }),
    });
    await advance(2_100);
    expect(saveProgress).toHaveBeenCalledTimes(1);
    await advance(10_000);
    expect(saveProgress).toHaveBeenCalledTimes(1);
  });

  it("carries on if a save fails, and tries again with the next change", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saveProgress.mockRejectedValueOnce(new Error("offline"));
    renderAttempt();

    fireEvent.click(radios()[0]);
    await advance(2_100);
    expect(saveProgress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("radiogroup")).toBeTruthy();

    fireEvent.click(radios()[1]);
    await advance(2_100);
    expect(saveProgress).toHaveBeenCalledTimes(2);
    expect(saveProgress.mock.calls[1][1].answers.q1).toBe(1);
  });
});

describe("integrity events", () => {
  const hideTab = () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  };

  it("numbers each event and sends it with the autosave, then doesn't send it again", async () => {
    vi.useFakeTimers();
    try {
      renderAttempt();
      hideTab();
      act(() => void window.dispatchEvent(new Event("blur")));
      await act(async () => void vi.advanceTimersByTime(2_100));

      expect(saveProgress).toHaveBeenCalledTimes(1);
      const events = saveProgress.mock.calls[0][1].events;
      expect(events.map((e: { seq: number; type: string }) => [e.seq, e.type])).toEqual([
        [1, "tab_hidden"],
        [2, "window_blur"],
      ]);

      await act(async () => void vi.advanceTimersByTime(10_000));
      expect(saveProgress).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an event until the server has it, and sends it again if the save failed", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      saveProgress.mockRejectedValueOnce(new Error("offline"));
      renderAttempt();
      hideTab();
      await act(async () => void vi.advanceTimersByTime(2_100));
      expect(saveProgress).toHaveBeenCalledTimes(1);

      // The next change carries the unsent event along, with its original number.
      fireEvent.click(radios()[0]);
      await act(async () => void vi.advanceTimersByTime(2_100));
      expect(saveProgress).toHaveBeenCalledTimes(2);
      expect(saveProgress.mock.calls[1][1].events.map((e: { seq: number }) => e.seq)).toEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends events that haven't been saved yet with the submit", async () => {
    renderAttempt();
    hideTab();
    act(() => void window.dispatchEvent(new Event("blur")));
    openSubmitDialog();
    await confirmSubmit();

    const events = submitAttempt.mock.calls[0][1].events as { type: string }[];
    expect(events.map((e) => e.type)).toEqual(["tab_hidden", "window_blur"]);
    // The results show what the server counted.
    expect(screen.getByText("Tab switches")).toBeTruthy();
    expect(screen.getByText("Window focus lost")).toBeTruthy();
  });

  it("continues numbering after a resume and resends what the server may not have", async () => {
    vi.useFakeTimers();
    try {
      renderAttempt({
        seed: seed({
          progress: {
            answers: { q1: null, q2: null, q3: null },
            flagged: {},
            index: 0,
            tabSwitches: 1,
            blurs: 0,
            fullscreenExits: 0,
            eventSeq: 4,
            pendingEvents: [{ seq: 4, type: "tab_hidden", at: 1 }],
          },
        }),
      });
      hideTab();
      await act(async () => void vi.advanceTimersByTime(2_100));
      const events = saveProgress.mock.calls[0][1].events as { seq: number }[];
      expect(events.map((e) => e.seq)).toEqual([4, 5]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("tab switches", () => {
  it("counts the tab being hidden and says so", () => {
    renderAttempt();
    expect(screen.queryByText(/Leaving this tab is recorded/)).toBeNull();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    fireEvent(document, new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    expect(screen.getByText(/So far:\s*1/)).toBeTruthy();
    expect(loadAttempt(attemptKey("quiz1", "u1"))?.tabSwitches).toBe(1);
  });
});

describe("fullscreen", () => {
  let fullscreenElement: Element | null = null;
  const fire = () => document.dispatchEvent(new Event("fullscreenchange"));
  const leaveFullscreen = () =>
    act(() => {
      fullscreenElement = null;
      fire();
    });

  const mockFullscreen = (supported = true, startFullscreen = true) => {
    fullscreenElement = startFullscreen ? document.documentElement : null;
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      get: () => supported,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    document.documentElement.requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.documentElement;
      fire();
    });
    document.exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      fire();
    });
  };

  const strictQuiz = { ...quiz, examMode: "strict" } as PublicQuiz;

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).fullscreenEnabled;
    delete (document as unknown as Record<string, unknown>).fullscreenElement;
  });

  it("strict: leaving fullscreen hides the questions, keeps the clock and counts the exit", () => {
    mockFullscreen();
    renderAttempt({ quiz: strictQuiz });
    expect(screen.getByRole("radiogroup")).toBeTruthy();

    leaveFullscreen();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText(/What is q1\?/)).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Return to fullscreen to continue" })
    ).toBeTruthy();
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(screen.getByText(/So far:/).textContent).toContain("1");
    expect(loadAttempt(attemptKey("quiz1", "u1"))?.fullscreenExits).toBe(1);
  });

  it("strict: returning restores the exam with the same answers, and the count is sent on submit", async () => {
    mockFullscreen();
    renderAttempt({ quiz: strictQuiz });
    fireEvent.click(radios()[1]);
    leaveFullscreen();

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Return to fullscreen" }))
    );
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    expect(radios()[1].checked).toBe(true);

    leaveFullscreen();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Return to fullscreen" }))
    );
    openSubmitDialog();
    await confirmSubmit();
    const sent = submitAttempt.mock.calls[0][1].events as { type: string }[];
    expect(sent.filter((e) => e.type === "fullscreen_exit")).toHaveLength(2);
    // The results show what the server counted from those events.
    expect(screen.getByText("Left fullscreen")).toBeTruthy();
    expect(document.exitFullscreen).toHaveBeenCalled(); // the results are a normal window
  });

  it("strict: says so when the browser refuses fullscreen", async () => {
    mockFullscreen();
    renderAttempt({ quiz: strictQuiz });
    leaveFullscreen();
    document.documentElement.requestFullscreen = vi.fn(async () => {
      throw new Error("denied");
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Return to fullscreen" }))
    );
    expect(screen.getByText(/didn't allow fullscreen/)).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("strict: the clock still auto-submits while the gate is up", async () => {
    mockFullscreen(true, false); // resumed after a reload, not yet back in fullscreen
    await act(async () => {
      renderAttempt({
        quiz: strictQuiz,
        seed: seed({ startedAt: Date.now() - 700_000, durationSec: 600 }),
      });
    });
    expect(submitAttempt).toHaveBeenCalledTimes(1);
  });

  it("strict: a browser without fullscreen support isn't gated (the lobby already refuses to start it)", () => {
    mockFullscreen(false, false);
    renderAttempt({ quiz: strictQuiz });
    expect(screen.getByRole("radiogroup")).toBeTruthy();
  });

  it("practice: leaving fullscreen shows a hint, doesn't block or count, and can be dismissed", async () => {
    mockFullscreen();
    renderAttempt(); // examMode missing = practice
    expect(screen.queryByText(/You've left fullscreen/)).toBeNull();

    leaveFullscreen();
    expect(screen.getByText(/You've left fullscreen/)).toBeTruthy();
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(loadAttempt(attemptKey("quiz1", "u1"))?.fullscreenExits).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/You've left fullscreen/)).toBeNull();

    openSubmitDialog();
    await confirmSubmit();
    const sent = submitAttempt.mock.calls[0][1].events as { type: string }[];
    expect(sent.filter((e) => e.type === "fullscreen_exit")).toHaveLength(0);
    expect(screen.queryByText("Left fullscreen")).toBeNull();
  });
});
