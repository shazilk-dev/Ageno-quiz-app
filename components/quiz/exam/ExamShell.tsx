"use client";

import { ArrowLeft, ArrowRight, Eye, Flag } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Container } from "@/components/layout/Container";
import { Button, Card, Dialog } from "@/components/ui";
import type { QuizAttemptApi } from "@/hooks/useQuizAttempt";
import { cn } from "@/lib/utils";
import ExamTopBar from "./ExamTopBar";
import QuestionNavigator from "./QuestionNavigator";
import QuestionView from "./QuestionView";

interface ExamShellProps {
  title: string;
  attempt: QuizAttemptApi;
  /** A dialog (submit confirmation) is open over the exam, so the shortcuts stand down. */
  dialogOpen: boolean;
  onRequestSubmit: () => void;
  /** A slim message under the top bar (the practice fullscreen hint). */
  notice?: ReactNode;
}

/**
 * The exam screen: top bar, one question, previous/flag/next, and the question navigator (a side panel
 * on desktop, a bottom sheet on phones). Keyboard: 1-9 or A-Z pick an option, Left and Right move
 * between questions.
 */
export default function ExamShell({
  title,
  attempt,
  dialogOpen,
  onRequestSubmit,
  notice,
}: ExamShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const {
    questions,
    question,
    index,
    answers,
    flagged,
    summary,
    status,
    goTo,
    next,
    previous,
    select,
  } = attempt;

  const total = questions.length;
  const isLast = index === total - 1;
  const isFlagged = !!flagged[question.id];
  const optionCount = question.options?.length ?? 0;

  useEffect(() => {
    if (dialogOpen || sheetOpen || status !== "taking") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.closest("dialog") ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          (target.tagName === "INPUT" &&
            (target as HTMLInputElement).type !== "radio"))
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault(); // The browser would otherwise move to the next radio.
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      } else {
        const key = event.key.toLowerCase();
        let option = -1;
        if (/^[1-9]$/.test(key)) option = Number(key) - 1;
        else if (/^[a-z]$/.test(key)) option = key.charCodeAt(0) - 97;
        if (option >= 0 && option < optionCount) {
          event.preventDefault();
          select(option);
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, sheetOpen, status, optionCount, next, previous, select]);

  return (
    <div
      data-theme="dark"
      className="flex min-h-dvh flex-1 flex-col bg-bg text-text"
    >
      <ExamTopBar
        title={title}
        position={index + 1}
        total={total}
        answered={summary.answered}
        deadline={attempt.deadline}
        durationSec={attempt.durationSec}
        onExpire={() => void attempt.submit("timeout")}
        onSubmit={onRequestSubmit}
        onOpenQuestions={() => setSheetOpen(true)}
      />
      {notice}

      <Container className="flex flex-1 flex-col pt-6 lg:py-8">
        <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:flex-none lg:gap-12">
          <div className="flex min-w-0 max-w-3xl flex-col">
            <div className="pb-6 lg:pb-0">
              <QuestionView
                key={question.id}
                question={question}
                position={index + 1}
                total={total}
                selected={answers[question.id] ?? null}
                onSelect={select}
                onClear={() => select(null)}
              />
            </div>

            {/* Sticky to the bottom of the screen on phones, so Next never scrolls out of reach. */}
            <div
              className={cn(
                "mt-6 flex items-center gap-3 max-lg:mt-auto lg:mt-8",
                "max-lg:sticky max-lg:bottom-0 max-lg:z-20 max-lg:-mx-4 max-lg:border-border max-lg:border-t max-lg:bg-bg/95 max-lg:px-4 max-lg:py-3 max-lg:backdrop-blur-md"
              )}
            >
              <Button
                variant="secondary"
                onClick={previous}
                disabled={index === 0}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Previous
              </Button>
              <Button
                variant="ghost"
                aria-pressed={isFlagged}
                onClick={attempt.toggleFlag}
                className={cn(isFlagged && "border border-accent text-text")}
              >
                <Flag
                  className={cn("size-4", isFlagged && "fill-current")}
                  aria-hidden="true"
                />
                <span className="sm:hidden">Flag</span>
                <span className="hidden sm:inline">Flag for review</span>
              </Button>
              {isLast ? (
                <Button className="ml-auto" onClick={onRequestSubmit}>
                  Review and submit
                </Button>
              ) : (
                <Button className="ml-auto" onClick={next}>
                  Next
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>

            {attempt.tabSwitches > 0 && (
              <p
                role="status"
                className="mt-4 mb-6 flex items-start gap-2 text-sm text-text-muted lg:mb-0"
              >
                <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Leaving this tab is recorded for the quiz owner. So far:{" "}
                {attempt.tabSwitches}.
              </p>
            )}
          </div>

          <aside aria-label="Question navigator" className="hidden lg:block">
            <Card className="sticky top-32 p-5">
              <h2 className="text-label mb-3">Questions</h2>
              <QuestionNavigator
                questions={questions}
                answers={answers}
                flagged={flagged}
                current={index}
                onSelect={goTo}
              />
            </Card>
          </aside>
        </div>
      </Container>

      {/* Phones: the same navigator as a bottom sheet. */}
      <Dialog
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Questions"
        className="mt-auto mb-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-b-none"
      >
        <QuestionNavigator
          questions={questions}
          answers={answers}
          flagged={flagged}
          current={index}
          onSelect={(target) => {
            goTo(target);
            setSheetOpen(false);
          }}
        />
      </Dialog>
    </div>
  );
}
