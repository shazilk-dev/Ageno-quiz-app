"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const FULLSCREEN_RULE = {
  practice:
    "The quiz opens in fullscreen. You can leave it, and switching tabs is recorded.",
  strict:
    "This quiz must be taken in fullscreen. Leaving fullscreen or switching tabs is recorded and may be flagged for review.",
};

const instructions = (examMode: "practice" | "strict") => [
  "The timer starts as soon as you begin and can't be paused.",
  "Answers are final once you submit. Until then, you can change them.",
  FULLSCREEN_RULE[examMode],
  "Keep a stable connection and don't refresh the page during the quiz.",
];

/** Descriptions longer than this are clamped to two lines with a "Show more" toggle. */
const CLAMP_AT = 130;

export interface LobbyFact {
  label: string;
  value: string;
}

interface LobbyAboutProps {
  title: string;
  description: string;
  facts: LobbyFact[];
  examMode: "practice" | "strict";
}

/** Left column: what the quiz is, the numbers that matter, and the ground rules. */
export default function LobbyAbout({
  title,
  description,
  facts,
  examMode,
}: LobbyAboutProps) {
  const [expanded, setExpanded] = useState(false);
  const long = description.length > CLAMP_AT;

  return (
    <div>
      <p className="text-label">{"// QUIZ"}</p>
      <h1 className="mt-2 text-3xl">{title}</h1>

      {description && (
        <div className="mt-3 max-w-[65ch]">
          <p
            className={cn(
              "text-text-body leading-relaxed",
              long && !expanded && "line-clamp-2"
            )}
          >
            {description}
          </p>
          {long && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
              className="inline-flex min-h-8 items-center text-link text-sm underline-offset-4 hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      <dl
        className="mt-5 grid max-w-xl divide-x divide-border overflow-hidden rounded-lg border border-border bg-surface"
        style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}
      >
        {facts.map((fact) => (
          <div key={fact.label} className="px-4 py-2.5 sm:px-5">
            <dt className="text-label">{fact.label}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="lobby-instructions" className="mt-6">
        <h2 id="lobby-instructions" className="text-label">
          Before you start
        </h2>
        <ul className="mt-3 max-w-[65ch] list-disc space-y-1.5 pl-5 text-text-body marker:text-text-muted">
          {instructions(examMode).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
