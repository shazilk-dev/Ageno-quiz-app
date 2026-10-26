"use client";

import { useState } from "react";
import QuestionReview from "@/components/quiz/exam/QuestionReview";
import { Button, Dialog } from "@/components/ui";
import type { ExamQuestion, ReviewItem } from "@/lib/exam/types";
import type { EditorQuestion } from "@/lib/quiz-schema";

type Scenario = "wrong" | "right";

interface PreviewReviewProps {
  question: EditorQuestion;
  open: boolean;
  onClose: () => void;
}

/** What the question card in a player's review will look like, drawn by the same component players get. */
export function PreviewReview({ question, open, onClose }: PreviewReviewProps) {
  const [scenario, setScenario] = useState<Scenario>("wrong");

  const options = question.options.map((option, index) => ({ ...option, index }));
  const right = options.filter((option) => option.isCorrect).map((option) => option.index);
  const firstWrong = options.find((option) => !option.isCorrect)?.index;
  // A wrong answer: a wrong option on its own for a single question; for select-all, one right option and one wrong.
  const wrongPicks =
    question.type === "multiple"
      ? [...right.slice(0, 1), ...(firstWrong === undefined ? [] : [firstWrong])]
      : firstWrong === undefined
        ? []
        : [firstWrong];
  const answer = scenario === "right" ? right : wrongPicks;

  const shown: ExamQuestion = {
    id: "preview",
    text: question.text || "(the question)",
    options: question.options.map((option, index) => option.text || `Option ${index + 1}`),
    type: question.type,
  };
  const review: ReviewItem = {
    correct: right,
    ...(question.explanation ? { explanation: question.explanation } : {}),
    ...(question.options.some((option) => option.rationale?.trim())
      ? { optionRationales: question.options.map((option) => option.rationale?.trim() || null) }
      : {}),
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Preview of the review"
      description="This is what a player sees after submitting."
      className="max-w-2xl"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Preview as">
          {(
            [
              ["wrong", "A wrong answer"],
              ["right", "The right answer"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={scenario === value ? "secondary" : "ghost"}
              aria-pressed={scenario === value}
              onClick={() => setScenario(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {open && (
          <ol>
            <QuestionReview question={shown} review={review} position={1} answer={answer} />
          </ol>
        )}
      </div>
    </Dialog>
  );
}
