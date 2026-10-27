"use client";

import { LoaderCircle } from "lucide-react";
import { Alert, Button, Dialog } from "@/components/ui";
import type { AttemptSummary } from "@/lib/exam/answers";
import type { AttemptStatus } from "@/hooks/useQuizAttempt";

interface SubmitDialogProps {
  /** The person asked to submit (the Submit button). Saving and failure keep it open on their own. */
  confirming: boolean;
  status: AttemptStatus;
  /** The clock ran out, so there is no going back to the questions. */
  timedOut: boolean;
  summary: AttemptSummary;
  /** Why the last submit failed, in words for the person (from the server or the network). */
  errorMessage?: string | null;
  /** Close the confirmation without submitting. */
  onCancel: () => void;
  /** Close a failed submit and return to the questions. */
  onDismissError: () => void;
  onSubmit: () => void;
  /** Close and jump to the first unanswered question. */
  onReviewUnanswered: () => void;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The submit confirmation, the saving state and the failure state in one dialog, so the same place
 * that asked "are you sure?" is where a failed save is reported, with a Retry.
 */
export default function SubmitDialog({
  confirming,
  status,
  timedOut,
  summary,
  errorMessage,
  onCancel,
  onDismissError,
  onSubmit,
  onReviewUnanswered,
}: SubmitDialogProps) {
  const submitting = status === "submitting";
  const failed = status === "error";
  const open = confirming || submitting || failed;

  if (submitting) {
    return (
      <Dialog
        open={open}
        onClose={() => {}}
        dismissible={false}
        title={timedOut ? "Time's up" : "Submitting your answers"}
      >
        <p role="status" className="flex items-center gap-3 text-text-body">
          <LoaderCircle
            className="size-5 shrink-0 animate-spin text-link"
            aria-hidden="true"
          />
          Saving your answers. Keep this page open.
        </p>
      </Dialog>
    );
  }

  if (failed) {
    return (
      <Dialog
        open={open}
        onClose={onDismissError}
        dismissible={!timedOut}
        title="We couldn't submit your answers"
        footer={
          <>
            {!timedOut && (
              <Button variant="secondary" onClick={onDismissError}>
                Back to questions
              </Button>
            )}
            <Button onClick={onSubmit}>Try again</Button>
          </>
        }
      >
        <Alert variant="error">
          {timedOut
            ? "Your time is up, so your answers can't be changed now. They're saved on this device."
            : "Nothing was lost: your answers are still here and saved on this device."}{" "}
          {errorMessage ?? "Check your connection and try again."}
        </Alert>
      </Dialog>
    );
  }

  const nothingLeft = summary.unanswered === 0 && summary.flagged === 0;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Submit your answers?"
      className="max-w-lg"
      description="Answers are final once you submit."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Keep working
          </Button>
          {summary.unanswered > 0 && (
            <Button variant="secondary" onClick={onReviewUnanswered}>
              Go to unanswered
            </Button>
          )}
          <Button onClick={onSubmit}>Submit answers</Button>
        </>
      }
    >
      {nothingLeft ? (
        <p className="text-text-body">
          You&apos;ve answered all {plural(summary.total, "question")}.
        </p>
      ) : (
        <ul className="space-y-2 text-text-body">
          {summary.unanswered > 0 && (
            <li>
              You have{" "}
              <strong className="font-semibold text-text">
                {summary.unanswered} unanswered
              </strong>{" "}
              of {plural(summary.total, "question")}.
            </li>
          )}
          {summary.flagged > 0 && (
            <li>
              You have{" "}
              <strong className="font-semibold text-text">
                {summary.flagged} flagged
              </strong>{" "}
              for review.
            </li>
          )}
        </ul>
      )}
    </Dialog>
  );
}
