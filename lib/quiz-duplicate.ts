import { LEVELS, LIMITS, type AdminQuizDetail, type QuizInput } from "@/lib/quiz-schema";

const PREFIX = "Copy of ";

/**
 * A new quiz made from an existing one: the same settings and questions, but its own title, a fresh access
 * code (left blank, the server makes one), no question ids (they belong to the original) and closed, so a
 * copy isn't offered to players before someone has looked at it. Results, leaderboards and the trash flag
 * are not part of a `QuizInput` and so don't come along.
 */
export function duplicateInput(quiz: AdminQuizDetail): QuizInput {
  const { id, version, createdAt, createdBy, responseCount, updateUnfinished, ...input } = quiz;
  void [id, version, createdAt, createdBy, responseCount, updateUnfinished];

  const levels: QuizInput["levels"] = {};
  for (const level of LEVELS) {
    const stored = quiz.levels[level];
    if (!stored || stored.questions.length === 0) continue;
    levels[level] = {
      duration: stored.duration,
      pointsMultiplier: stored.pointsMultiplier,
      questions: stored.questions.map(({ id: questionId, ...question }) => {
        void questionId;
        return { ...question, options: question.options.map((option) => ({ ...option })) };
      }),
    };
  }

  const title = `${PREFIX}${quiz.title.trim() || "Untitled quiz"}`;
  return {
    ...input,
    title: title.length > LIMITS.title ? title.slice(0, LIMITS.title).trimEnd() : title,
    accessCode: "",
    active: false,
    levels,
  };
}
