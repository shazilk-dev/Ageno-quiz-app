"use client";

import { Clock, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatClock, secondsUntil } from "@/lib/exam/answers";
import { cn } from "@/lib/utils";

const LOW_SECONDS = 5 * 60;
const FINAL_SECONDS = 60;

interface ExamTimerProps {
  /** Epoch ms. The time left is always worked out from this, so reloads and throttled tabs stay right. */
  deadline: number;
  /** The attempt's full length, so a 3-minute quiz doesn't announce "5 minutes left" on the first second. */
  totalSeconds: number;
  /** Called once when the time reaches zero. */
  onExpire: () => void;
}

/**
 * Mono countdown. It warns at 5 minutes and at 1 minute with an icon and words as well as colour, and
 * announces both to screen readers once (the clock itself is not live, so it doesn't chatter every second).
 */
export default function ExamTimer({
  deadline,
  totalSeconds,
  onExpire,
}: ExamTimerProps) {
  const [remaining, setRemaining] = useState(() =>
    secondsUntil(deadline, Date.now())
  );

  // One interval for the life of the timer. It re-reads the wall clock rather than counting ticks, and
  // a returning tab catches up at once. State only changes when the displayed second does.
  useEffect(() => {
    const tick = () => setRemaining(secondsUntil(deadline, Date.now()));
    tick();
    const id = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [deadline]);

  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });
  const expiredRef = useRef(false);
  useEffect(() => {
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpireRef.current();
    }
  }, [remaining]);

  const final = remaining <= FINAL_SECONDS && totalSeconds > FINAL_SECONDS;
  const low = !final && remaining <= LOW_SECONDS && totalSeconds > LOW_SECONDS;
  const Icon = final || low ? TriangleAlert : Clock;

  return (
    <>
      <div className="flex items-center gap-2">
        {(low || final) && (
          <span
            aria-hidden="true"
            className={cn(
              "hidden font-mono text-xs uppercase tracking-[0.05em] sm:inline",
              final ? "text-error" : "text-warning"
            )}
          >
            {final ? "1 min left" : "5 min left"}
          </span>
        )}
        <div
          role="timer"
          aria-label="Time remaining"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 font-mono text-sm tabular-nums",
            final
              ? "border-error text-error"
              : low
                ? "border-warning text-warning"
                : "border-border text-accent"
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {formatClock(remaining)}
        </div>
      </div>
      <p role="status" className="sr-only">
        {low ? "Less than 5 minutes remaining." : ""}
      </p>
      <p role="alert" className="sr-only">
        {final
          ? "Less than 1 minute remaining. Your answers will be submitted automatically when time runs out."
          : ""}
      </p>
    </>
  );
}
