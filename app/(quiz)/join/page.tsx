"use client";

import { SearchX, TextSearch } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import JoinCodeForm from "@/components/join/JoinCodeForm";
import QuizToolbar, {
  type AccessFilter,
  type QuizSort,
} from "@/components/join/QuizToolbar";
import { Container } from "@/components/layout/Container";
import QuizCard from "@/components/QuizCard";
import { Alert, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import type { PublicQuiz } from "@/lib/quiz-data";
import { fetchQuizzes } from "@/lib/quizzes-api";

const VIEW_KEY = "ageno:join:view";
const GRID ="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3";

function QuizCardSkeleton() {
  return (
    <Card className="flex h-full flex-col p-5">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-3 h-6 w-2/3" />
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="mt-auto flex items-center justify-between border-border border-t pt-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
    </Card>
  );
}

const createdTime = (quiz: PublicQuiz): number => quiz.createdAt.getTime();

export default function JoinQuiz() {
  const { user, loading: authLoading } = useAuth();
  const [quizzes, setQuizzes] = useState<PublicQuiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AccessFilter>("all");
  const [sort, setSort] = useState<QuizSort>("newest");

  const loadQuizzes = useCallback(async () => {
    setIsLoading(true);
    setLoadFailed(false);
    try {
      setQuizzes(await fetchQuizzes());
    } catch (err) {
      console.error("Error fetching quizzes:", err);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  // Coming back from a quiz lobby should land on the same search, filter and sort. Session-scoped, and
  // optional: storage can be unavailable (private windows), so every access is guarded.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? "null");
      if (saved) {
        if (typeof saved.search === "string") setSearch(saved.search);
        if (["all", "open", "code"].includes(saved.filter)) setFilter(saved.filter);
        if (["newest", "title"].includes(saved.sort)) setSort(saved.sort);
      }
    } catch {}
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify({ search, filter, sort }));
    } catch {}
  }, [restored, search, filter, sort]);

  // Search runs first so the filter chips can show how many quizzes each one would leave.
  const searched = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return quizzes;
    return quizzes.filter(
      (quiz) =>
        quiz.title?.toLowerCase().includes(term) ||
        quiz.description?.toLowerCase().includes(term)
    );
  }, [search, quizzes]);

  const counts = useMemo(() => {
    const open = searched.filter((q) => q.requiresAccessCode === false).length;
    return { all: searched.length, open, code: searched.length - open };
  }, [searched]);

  const visible = useMemo(() => {
    const filtered = searched.filter((quiz) => {
      if (filter === "open") return quiz.requiresAccessCode === false;
      if (filter === "code") return quiz.requiresAccessCode !== false;
      return true;
    });
    return [...filtered].sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : createdTime(b) - createdTime(a)
    );
  }, [searched, filter, sort]);

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
  };

  return (
    <div data-theme="dark" className="flex-1 bg-bg text-text">
      <Container className="py-8 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-label">{"// QUIZZES"}</p>
            <h1 className="mt-2 text-3xl">Join a quiz</h1>
            <p className="mt-2 max-w-[65ch] text-text-muted">
              Pick a quiz from the list, or enter the access code you were
              given.
            </p>
          </div>
          <JoinCodeForm
            signedIn={authLoading ? null : !!user}
            className="w-full lg:w-auto"
          />
        </div>

        <div className="mt-6">
          <QuizToolbar
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
            counts={counts}
            sort={sort}
            onSortChange={setSort}
            resultCount={visible.length}
            disabled={isLoading || loadFailed}
          />
        </div>

        <section aria-label="Available quizzes" className="mt-5">
          {isLoading ? (
            <div className={GRID} aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <QuizCardSkeleton key={i} />
              ))}
            </div>
          ) : loadFailed ? (
            <Alert
              variant="error"
              title="We couldn't load the quizzes"
              action={
                <Button variant="secondary" size="sm" onClick={loadQuizzes}>
                  Retry
                </Button>
              }
            >
              Check your connection and try again. You can still join with an
              access code.
            </Alert>
          ) : quizzes.length === 0 ? (
            <EmptyState
              icon={TextSearch}
              title="No quizzes are open yet"
              description="New quizzes show up here as soon as they're published. If you have an access code, you can enter it above."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No quizzes match"
              description="Try a different word, or clear the search and filters to see everything."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear search and filters
                </Button>
              }
            />
          ) : (
            <ul className={`${GRID} fade-in`}>
              {visible.map((quiz) => (
                <li key={quiz.id}>
                  <QuizCard quiz={quiz} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </Container>
    </div>
  );
}
