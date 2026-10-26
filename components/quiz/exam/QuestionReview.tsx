import { Check, CircleHelp, X } from "lucide-react";
import { Card } from "@/components/ui";
import {
  getOptionText,
  getQuestionStatus,
  type QuestionStatus,
} from "@/lib/exam/answers";
import type { ExamQuestion, ReviewItem } from "@/lib/exam/types";
import { cn } from "@/lib/utils";

const statusMeta: Record<
  QuestionStatus,
  { label: string; className: string; Icon: typeof Check }
> = {
  correct: { label: "Correct", className: "text-success", Icon: Check },
  incorrect: { label: "Incorrect", className: "text-error", Icon: X },
  unanswered: {
    label: "Not answered",
    className: "text-text-muted",
    Icon: CircleHelp,
  },
};

interface QuestionReviewProps {
  question: ExamQuestion;
  /** What the server revealed after the submit: the right options, their reasons and an explanation. */
  review: ReviewItem;
  /** 1-based. */
  position: number;
  /** The options this person picked (`[]` when the question was skipped). */
  answer: number[];
}

const letter = (index: number) => String.fromCharCode(65 + index);

/**
 * One reviewed question: its options with your picks and the right ones marked in words. The reason for a
 * right option, or for a wrong option you picked, sits under that option; the reasons for the rest are
 * folded away under "Why the others are wrong". An overall explanation, if there is one, follows.
 */
export default function QuestionReview({
  question,
  review,
  position,
  answer,
}: QuestionReviewProps) {
  const { correct } = review;
  const status = getQuestionStatus(correct, answer);
  const { label, className, Icon } = statusMeta[status];
  const options = question.options ?? [];
  const reasonOf = (index: number) => review.optionRationales?.[index] || null;
  const others = options
    .map((option, index) => ({ option, index, reason: reasonOf(index) }))
    .filter(({ index, reason }) => reason && !correct.includes(index) && !answer.includes(index));
  const selectAll = question.type === "multiple";

  return (
    <li>
      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-label">Question {position}</p>
          <p
            className={cn(
              "inline-flex items-center gap-1.5 font-medium text-sm",
              className
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </p>
        </div>

        <h3 className="mt-2 whitespace-pre-line text-lg leading-snug">
          {question.text}
        </h3>

        {selectAll && (
          <p className="mt-1 text-sm text-text-muted">
            Select-all question: it counts only when you pick exactly the correct options.
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {options.map((option, index) => {
            const isYours = answer.includes(index);
            const isRight = correct.includes(index);
            const reason = isRight || isYours ? reasonOf(index) : null;
            const tags: string[] = [];
            if (isYours) tags.push("Your answer");
            if (isRight) tags.push("Correct answer");
            return (
              <li
                key={index}
                className={cn(
                  "rounded-md border px-4 py-2.5 text-text-body",
                  isRight
                    ? "border-success"
                    : isYours
                      ? "border-error"
                      : "border-border"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">
                    {getOptionText(option, index)}
                  </span>
                  {tags.length > 0 && (
                    <span className="shrink-0 pt-0.5 font-mono text-text text-xs uppercase tracking-[0.05em]">
                      {tags.join(" · ")}
                    </span>
                  )}
                </div>
                {reason && (
                  <p
                    className={cn(
                      "mt-2 whitespace-pre-line text-sm [overflow-wrap:anywhere]",
                      isYours && !isRight ? "text-text" : "text-text-muted"
                    )}
                  >
                    {reason}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {others.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-text-muted underline-offset-4 hover:text-text hover:underline">
              Why the others are wrong
            </summary>
            <ul className="space-y-2 pb-1">
              {others.map(({ option, index, reason }) => (
                <li key={index} className="text-text-muted [overflow-wrap:anywhere]">
                  <span className="font-mono text-text">{letter(index)}.</span>{" "}
                  <span className="text-text-body">{getOptionText(option, index)}</span>
                  {": "}
                  <span className="whitespace-pre-line">{reason}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {review.explanation && (
          <p className="mt-4 border-border border-t pt-4 text-sm text-text-body">
            <span className="text-label mr-2">Why</span>
            {review.explanation}
          </p>
        )}
      </Card>
    </li>
  );
}
