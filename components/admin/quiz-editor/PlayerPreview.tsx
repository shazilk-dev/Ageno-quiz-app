"use client";

import { useState } from "react";
import QuestionReview from "@/components/quiz/exam/QuestionReview";
import QuestionView from "@/components/quiz/exam/QuestionView";
import { Button, Dialog } from "@/components/ui";
import { togglePick } from "@/lib/exam/answers";
import type { ExamQuestion, ReviewItem } from "@/lib/exam/types";
import type { EditorQuestion } from "@/lib/quiz-schema";

type Mode = "answer" | "review";

interface PlayerPreviewProps {
  /** The questions to walk through (one level, or a single question). */
  questions: readonly EditorQuestion[];
  /** Which one to open on. */
  start: number;
  /** "Easy", for the dialog's description. */
  levelLabel: string;
  open: boolean;
  onClose: () => void;
}

/** A question as a player is sent it: no key, only the type and, for select-all, how many to choose. */
function asPlayerSees(question: EditorQuestion, index: number): ExamQuestion {
  const right = question.options.filter((option) => option.isCorrect).length;
  return {
    id: `preview-${index}`,
    text: question.text || "(the question isn't written yet)",
    options: question.options.map((option) => option.text),
    type: question.type,
    ...(question.type === "multiple" && right > 0 ? { pickCount: right } : {}),
    ...(question.imageUrl?.trim() ? { imageUrl: question.imageUrl.trim() } : {}),
  };
}

/** What a player is shown after the submit: the key, the reasons and the explanation. */
function asReview(question: EditorQuestion): ReviewItem {
  return {
    correct: question.options.flatMap((option, index) => (option.isCorrect ? [index] : [])),
    ...(question.explanation?.trim() ? { explanation: question.explanation.trim() } : {}),
    ...(question.options.some((option) => option.rationale?.trim())
      ? { optionRationales: question.options.map((option) => option.rationale?.trim() || null) }
      : {}),
  };
}

/** A wrong answer to try: a wrong option on its own, or for select-all one right option and one wrong. */
function wrongPicks(question: EditorQuestion): number[] {
  const right = question.options.flatMap((option, index) => (option.isCorrect ? [index] : []));
  const wrong = question.options.findIndex((option) => !option.isCorrect);
  if (wrong < 0) return [];
  return question.type === "multiple" ? [...right.slice(0, 1), wrong].sort((a, b) => a - b) : [wrong];
}

/**
 * The question as a player will meet it, drawn by the same components: first while answering (try picking),
 * then in the review after submitting (with the right answer, your picks, the reasons). Walk through a
 * whole level or look at one question.
 */
export function PlayerPreview({ questions, start, levelLabel, open, onClose }: PlayerPreviewProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Preview as a player"
      description={`${levelLabel} level. Nothing you pick here is saved.`}
      className="max-w-2xl"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {open && <Preview questions={questions} start={start} />}
    </Dialog>
  );
}

function Preview({ questions, start }: { questions: readonly EditorQuestion[]; start: number }) {
  const total = questions.length;
  const [index, setIndex] = useState(Math.min(Math.max(start, 0), Math.max(total - 1, 0)));
  const [mode, setMode] = useState<Mode>("answer");
  const [picks, setPicks] = useState<Record<number, number[]>>({});

  const question = questions[index];
  if (!question) return <p className="text-text-muted">There are no questions to preview.</p>;

  const shown = asPlayerSees(question, index);
  const picked = picks[index] ?? [];
  const setPicked = (next: number[]) => setPicks((current) => ({ ...current, [index]: next }));
  const go = (to: number) => {
    setIndex(to);
    setMode("answer");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label="Show">
          {(
            [
              ["answer", "While answering"],
              ["review", "After submitting"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={mode === value ? "secondary" : "ghost"}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {total > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
              Previous
            </Button>
            <span className="font-mono text-sm text-text-muted" role="status">
              {index + 1} of {total}
            </span>
            <Button size="sm" variant="ghost" onClick={() => go(index + 1)} disabled={index === total - 1}>
              Next
            </Button>
          </div>
        )}
      </div>

      {mode === "answer" ? (
        <QuestionView
          key={shown.id}
          question={shown}
          position={index + 1}
          total={total}
          selected={picked}
          onSelect={(option) => setPicked(togglePick(picked, option, shown.type))}
          onClear={() => setPicked([])}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-text-muted">Show the review for</span>
            <Button size="sm" variant="ghost" onClick={() => setPicked(wrongPicks(question))}>
              a wrong answer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(asReview(question).correct)}>
              the right answer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
              no answer
            </Button>
          </div>
          <ol>
            <QuestionReview question={shown} review={asReview(question)} position={index + 1} answer={picked} />
          </ol>
        </>
      )}
    </div>
  );
}
