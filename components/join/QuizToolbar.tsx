"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { FilterTabs, SearchInput } from "@/components/ui";

export type AccessFilter = "all" | "open" | "code";
export type QuizSort = "newest" | "title";

interface QuizToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: AccessFilter;
  onFilterChange: (value: AccessFilter) => void;
  counts: Record<AccessFilter, number>;
  sort: QuizSort;
  onSortChange: (value: QuizSort) => void;
  /** Number of quizzes currently listed. Announced politely to screen readers when it changes. */
  resultCount: number;
  disabled?: boolean;
}

/**
 * One row on desktop: access tabs (with counts) on the left, search and sort on the right, all sitting on
 * a single hairline. On phones the search and sort come first and the tabs sit just above the list.
 */
export default function QuizToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  counts,
  sort,
  onSortChange,
  resultCount,
  disabled = false,
}: QuizToolbarProps) {
  const sortId = useId();

  return (
    <div className="flex flex-col border-b border-border lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <FilterTabs<AccessFilter>
        label="Filter by access"
        value={filter}
        onChange={onFilterChange}
        className="order-2 lg:order-1"
        options={[
          { value: "all", label: "All", count: disabled ? undefined : counts.all },
          { value: "open", label: "Open", count: disabled ? undefined : counts.open },
          {
            value: "code",
            label: "Code required",
            count: disabled ? undefined : counts.code,
          },
        ]}
      />

      <div className="order-1 flex gap-2 pb-3 lg:order-2 lg:py-2">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          label="Search quizzes"
          placeholder="Search quizzes"
          className="min-w-0 flex-1 lg:w-72 lg:flex-none"
          inputClassName="h-11 rounded-md"
        />

        <div className="relative shrink-0">
          <label htmlFor={sortId} className="sr-only">
            Sort quizzes by
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-text-muted"
          >
            Sort
          </span>
          <select
            id={sortId}
            value={sort}
            onChange={(event) => onSortChange(event.target.value as QuizSort)}
            className="h-11 cursor-pointer appearance-none rounded-md border border-control-border bg-surface pr-9 pl-12 text-sm text-text transition-fast hover:border-text-muted focus-visible:border-accent"
          >
            <option value="newest">Newest</option>
            <option value="title">Title A–Z</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
        </div>
      </div>

      <p role="status" className="sr-only">
        {disabled
          ? ""
          : `${resultCount} ${resultCount === 1 ? "quiz" : "quizzes"}`}
      </p>
    </div>
  );
}
