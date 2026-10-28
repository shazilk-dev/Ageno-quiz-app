import { Check, ChevronRight, CircleHelp, X } from "lucide-react";
import RichText from "@/components/rich-text/RichText";
import { Card } from "@/components/ui";
import {
  getOptionText,
  getQuestionStatus,
  type QuestionStatus,
} from "@/lib/exam/answers";
import type { ExamQuestion, ReviewItem } from "@/lib/exam/types";
import { cn } from "@/lib/utils";

/** The status pill beside the question number: an icon and a word on a tint, never colour alone. */
const statusMeta: Record<
  QuestionStatus,
  { label: string; className: string; Icon: typeof Check }
> = {
  correct: {
    label: "Correct",
    className: "border-success-line bg-success-soft text-success",
    Icon: Check,
  },
  incorrect: {
    label: "Incorrect",
    className: "border-error-line bg-error-soft text-error",
    Icon: X,
  },
  unanswered: {
    label: "Not answered",
    className: "border-border bg-bg-alt text-text-muted",
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
 * One reviewed question, kept short so two fit a screen. Each option says what it was in words, an icon and
 * a tint: a right option is green with a check, a wrong pick is red with a cross, the rest stay plain. The
 * reason for a right option, or for a wrong option you picked, sits in a ruled block inside that option; the
 * reasons for the rest are folded away under "Why the others are wrong". An overall explanation follows.
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
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium font-mono text-text-muted text-xs uppercase tracking-[0.05em]">
            Question {position}
          </h3>
          <p
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold text-xs",
              className
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </p>
        </div>

        <RichText
          text={question.text}
          className="mt-2 font-medium text-base text-text leading-[1.45] tracking-normal"
        />

        {selectAll && (
          <p className="mt-1 text-text-muted text-xs">
            Select-all question: it counts only when you pick exactly the correct options.
          </p>
        )}

        <ul className="mt-3 space-y-2">
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
                  "flex items-start gap-3 rounded-md border px-3 py-2 text-[15px] text-text-body leading-[1.4]",
                  isRight
                    ? "border-success-line bg-success-soft"
                    : isYours
                      ? "border-error-line bg-error-soft"
                      : "border-border bg-surface"
                )}
              >
                <span
                  aria-hidden="true"
                  className="mt-px grid size-5 shrink-0 place-items-center font-mono text-text-muted text-xs"
                >
                  {isRight ? (
                    <Check className="size-4 text-success" strokeWidth={2.5} />
                  ) : isYours ? (
                    <X className="size-4 text-error" strokeWidth={2.5} />
                  ) : (
                    letter(index)
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <RichText
                      mode="inline"
                      text={getOptionText(option, index)}
                      className="min-w-0 [overflow-wrap:anywhere]"
                    />
                    {tags.length > 0 && (
                      <span
                        className={cn(
                          "w-fit shrink-0 rounded-full border bg-surface px-2 py-px font-semibold text-xs leading-[1.4]",
                          isRight
                            ? "border-success-line text-success"
                            : "border-error-line text-error"
                        )}
                      >
                        {tags.join(" · ")}
                      </span>
                    )}
                  </div>
                  {reason && (
                    <div
                      className={cn(
                        "mt-2 rounded-r-md border-l-[3px] bg-surface/70 px-3 py-2 text-sm leading-[1.5]",
                        isRight ? "border-success" : "border-error"
                      )}
                    >
                      <p className="font-semibold text-text text-xs">
                        {isRight ? "Why it's correct" : "Why it's wrong"}
                      </p>
                      <p className="mt-0.5 max-w-[65ch] [overflow-wrap:anywhere]">
                        <RichText mode="inline" text={reason} />
                      </p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {others.length > 0 && (
          <details className="group mt-3 border-border border-t">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 font-medium text-sm text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-4 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              Why the others are wrong
            </summary>
            <ul className="space-y-2 pb-1 text-sm leading-[1.5]">
              {others.map(({ option, index, reason }) => (
                <li key={index} className="text-text-muted [overflow-wrap:anywhere]">
                  <span className="font-mono text-text">{letter(index)}.</span>{" "}
                  <RichText mode="inline" text={getOptionText(option, index)} className="text-text-body" />
                  {": "}
                  <RichText mode="inline" text={reason ?? ""} />
                </li>
              ))}
            </ul>
          </details>
        )}

        {review.explanation && (
          <div className="mt-3 rounded-r-md border-border-strong border-l-[3px] bg-bg-alt px-3 py-2.5 text-sm text-text-body leading-[1.5]">
            <p className="font-semibold text-text text-xs">Explanation</p>
            <RichText text={review.explanation} className="mt-0.5 [overflow-wrap:anywhere]" />
          </div>
        )}
      </Card>
    </li>
  );
}
