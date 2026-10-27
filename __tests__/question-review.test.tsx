// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import QuestionReview from "@/components/quiz/exam/QuestionReview";
import type { ExamQuestion, ReviewItem } from "@/lib/exam/types";

afterEach(cleanup);

const single: ExamQuestion = {
  id: "q1",
  text: "Which planet is closest to the sun?",
  options: ["Venus", "Mercury", "Mars", "Earth"],
  type: "single",
};

function show(question: ExamQuestion, review: ReviewItem, answer: number[]) {
  render(
    <ol>
      <QuestionReview question={question} review={review} position={3} answer={answer} />
    </ol>
  );
}

/** The row of an option, found by its text (the first match: the options come before the fold). */
const row = (text: string) => screen.getAllByText(text)[0].closest("li") as HTMLElement;

// The meaning is carried by words and icons, so these tests look for those, never for a colour.
describe("QuestionReview states", () => {
  it("a right pick: Correct status, one pill saying both, a check, no cross", () => {
    show(single, { correct: [1] }, [1]);

    expect(screen.getByText("Question 3")).toBeTruthy();
    expect(screen.getByText("Correct")).toBeTruthy();
    const mercury = row("Mercury");
    expect(within(mercury).getByText("Your answer · Correct answer")).toBeTruthy();
    expect(mercury.querySelector("svg.lucide-check")).toBeTruthy();
    expect(mercury.querySelector("svg.lucide-x")).toBeNull();
    // The other options are plain: their letter, no icon, no pill.
    const venus = row("Venus");
    expect(within(venus).getByText("A")).toBeTruthy();
    expect(venus.querySelector("svg")).toBeNull();
    expect(within(venus).queryByText(/answer/i)).toBeNull();
  });

  it("a wrong pick: Incorrect status, a cross and 'Your answer' on it, a check and 'Correct answer' on the right one", () => {
    show(single, { correct: [1] }, [0]);

    expect(screen.getByText("Incorrect")).toBeTruthy();
    const venus = row("Venus");
    expect(within(venus).getByText("Your answer")).toBeTruthy();
    expect(venus.querySelector("svg.lucide-x")).toBeTruthy();
    const mercury = row("Mercury");
    expect(within(mercury).getByText("Correct answer")).toBeTruthy();
    expect(mercury.querySelector("svg.lucide-check")).toBeTruthy();
  });

  it("a skipped question: Not answered, and the right option is still shown", () => {
    show(single, { correct: [1] }, []);

    expect(screen.getByText("Not answered")).toBeTruthy();
    expect(within(row("Mercury")).getByText("Correct answer")).toBeTruthy();
    expect(screen.queryByText("Your answer")).toBeNull();
  });

  it("a select-all question says how it counts and marks each option on its own", () => {
    const multiple: ExamQuestion = {
      id: "q2",
      text: "Pick the primes",
      options: ["2", "4", "5", "9"],
      type: "multiple",
    };
    show(multiple, { correct: [0, 2] }, [0, 1]);

    expect(screen.getByText(/Select-all question: it counts only when you pick exactly/)).toBeTruthy();
    expect(screen.getByText("Incorrect")).toBeTruthy();
    expect(within(row("2")).getByText("Your answer · Correct answer")).toBeTruthy();
    expect(within(row("4")).getByText("Your answer")).toBeTruthy();
    expect(within(row("5")).getByText("Correct answer")).toBeTruthy(); // missed
    expect(within(row("9")).queryByText(/answer/i)).toBeNull();
  });
});

describe("QuestionReview reasons", () => {
  it("puts a reason inside the right option and the wrong pick, labelled, and folds the rest away", () => {
    show(
      single,
      {
        correct: [1],
        explanation: "Mercury orbits at 0.39 AU.",
        optionRationales: ["Venus is second.", "It is the innermost planet.", "Mars is fourth.", null],
      },
      [0]
    );

    const mercury = row("Mercury");
    expect(within(mercury).getByText("Why it's correct")).toBeTruthy();
    expect(within(mercury).getByText("It is the innermost planet.")).toBeTruthy();
    const venus = row("Venus");
    expect(within(venus).getByText("Why it's wrong")).toBeTruthy();
    expect(within(venus).getByText("Venus is second.")).toBeTruthy();

    // Mars was neither right nor picked: its reason is in the fold, not in its row.
    expect(within(row("Mars")).queryByText("Mars is fourth.")).toBeNull();
    const fold = screen.getByText("Why the others are wrong").closest("details") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(within(fold).getByText("Mars is fourth.")).toBeTruthy();

    expect(screen.getByText("Explanation")).toBeTruthy();
    expect(screen.getByText("Mercury orbits at 0.39 AU.")).toBeTruthy();
  });

  it("shows no reason blocks, no fold and no explanation when none were written", () => {
    show(single, { correct: [1] }, [0]);

    expect(screen.queryByText("Why it's correct")).toBeNull();
    expect(screen.queryByText("Why it's wrong")).toBeNull();
    expect(screen.queryByText("Why the others are wrong")).toBeNull();
    expect(screen.queryByText("Explanation")).toBeNull();
  });
});
