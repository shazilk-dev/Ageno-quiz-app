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
  /** What the server revealed after the submit: the right option and an optional explanation. */
  review: ReviewItem;
  /** 1-based. */
  position: number;
  answer: number | null;
}

/** One reviewed question: its options with your answer and the right one marked in words, plus any explanation. */
export default function QuestionReview({
  question,
  review,
  position,
  answer,
}: QuestionReviewProps) {
  const { correctIndex } = review;
  const status = getQuestionStatus(correctIndex, answer);
  const { label, className, Icon } = statusMeta[status];

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

        <ul className="mt-4 space-y-2">
          {(question.options ?? []).map((option, index) => {
            const isYours = answer === index;
            const isRight = correctIndex === index;
            const tags: string[] = [];
            if (isYours) tags.push("Your answer");
            if (isRight) tags.push("Correct answer");
            return (
              <li
                key={index}
                className={cn(
                  "flex items-start justify-between gap-4 rounded-md border px-4 py-2.5 text-text-body",
                  isRight
                    ? "border-success"
                    : isYours
                      ? "border-error"
                      : "border-border"
                )}
              >
                <span className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">
                  {getOptionText(option, index)}
                </span>
                {tags.length > 0 && (
                  <span className="shrink-0 pt-0.5 font-mono text-text text-xs uppercase tracking-[0.05em]">
                    {tags.join(" · ")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

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
