import { ArrowRight, Clock, Lock } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui";
import type { PublicQuiz } from "@/lib/quiz-data";
import { getDifficultyDuration } from "@/utils/difficulty-helpers";

const DIFFICULTY_ORDER = ["easy", "medium", "hard"];

interface QuizCardProps {
  quiz: PublicQuiz;
}

/** "30 min", or "20–45 min" when the time limit depends on the chosen difficulty. */
function durationLabel(quiz: PublicQuiz): string | null {
  const levels = quiz.availableDifficulties ?? [];
  const minutes = levels
    .filter(
      (level) =>
        quiz.duration > 0 ||
        quiz.difficultySettings?.[level as keyof typeof quiz.difficultySettings]
          ?.duration
    )
    .map((level) => getDifficultyDuration(quiz, level));

  if (minutes.length === 0 && quiz.duration > 0) minutes.push(quiz.duration);
  if (minutes.length === 0) return null;

  const min = Math.min(...minutes);
  const max = Math.max(...minutes);
  return min === max ? `${min} min` : `${min}–${max} min`;
}

function levelsLabel(quiz: PublicQuiz): string | null {
  const levels = [...(quiz.availableDifficulties ?? [])].sort(
    (a, b) =>
      (DIFFICULTY_ORDER.indexOf(a) + 1 || 99) -
      (DIFFICULTY_ORDER.indexOf(b) + 1 || 99)
  );
  return levels.length > 0 ? levels.join(" · ") : null;
}

/**
 * One quiz in the join list. The whole card is the link; it goes to the lobby, which asks for the access
 * code when the quiz needs one. The code itself is never shown here.
 * Top to bottom: levels (mono label), title, description, then a footer with time and what happens next.
 */
export default function QuizCard({ quiz }: QuizCardProps) {
  const duration = durationLabel(quiz);
  const levels = levelsLabel(quiz);
  const needsCode = quiz.requiresAccessCode !== false;

  return (
    <Link
      href={`/q/${quiz.id}`}
      className="group block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Card interactive className="flex h-full flex-col p-5">
        {levels && <p className="text-label">{levels}</p>}

        <h2 className="mt-2 line-clamp-2 text-lg leading-snug">{quiz.title}</h2>

        {quiz.description && (
          <p className="mt-2 line-clamp-2 text-sm text-text-body">
            {quiz.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 border-border border-t pt-4 text-sm">
          <span className="inline-flex items-center gap-1.5 font-mono text-text-muted text-xs tabular-nums">
            {duration && (
              <>
                <Clock className="size-3.5" aria-hidden="true" />
                {duration}
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5 text-text-muted transition-fast group-hover:text-accent">
            {needsCode ? (
              <>
                <Lock className="size-3.5" aria-hidden="true" />
                Code required
              </>
            ) : (
              <>
                Start
                <ArrowRight
                  className="size-4 transition-fast group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </>
            )}
          </span>
        </div>
      </Card>
    </Link>
  );
}
