"use client";

import { Select, SegmentedControl } from "@/components/ui";

export type TimeFrame = "all" | "week" | "month";

interface LeaderboardFiltersProps {
  /** Quizzes to filter by, from the leaderboard response. */
  quizzes: Array<{ id: string; title: string }>;
  timeFrame: TimeFrame;
  quizId: string;
  difficulty: string;
  onTimeFrameChange: (value: TimeFrame) => void;
  onQuizChange: (value: string) => void;
  onDifficultyChange: (value: string) => void;
}

export default function LeaderboardFilters({
  quizzes,
  timeFrame,
  quizId,
  difficulty,
  onTimeFrameChange,
  onQuizChange,
  onDifficultyChange,
}: LeaderboardFiltersProps) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr_1fr] md:items-end">
      <SegmentedControl<TimeFrame>
        label="Time period"
        value={timeFrame}
        onChange={onTimeFrameChange}
        options={[
          { value: "all", label: "All time" },
          { value: "month", label: "Month" },
          { value: "week", label: "Week" },
        ]}
      />
      <Select
        label="Quiz"
        value={quizId}
        onChange={(event) => onQuizChange(event.target.value)}
      >
        <option value="">All quizzes</option>
        {quizzes.map((quiz) => (
          <option key={quiz.id} value={quiz.id}>
            {quiz.title}
          </option>
        ))}
      </Select>
      <Select
        label="Difficulty"
        value={difficulty}
        onChange={(event) => onDifficultyChange(event.target.value)}
      >
        <option value="">All difficulties</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </Select>
    </div>
  );
}
